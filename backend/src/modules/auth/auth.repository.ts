import { getDatabaseClient, toAppError } from '../../database/index.js';
import type { Profile, UserRole } from './auth.types.js';

/**
 * Loads the SetuX profile for an authenticated identity.
 *
 * Returns `null` when no profile exists rather than throwing, so the service
 * layer decides what a missing profile means. The lookup is by primary key,
 * which is the authenticated user's id — a caller can never widen it.
 *
 * This query runs through the service-role client and therefore bypasses RLS.
 * That is safe here precisely because the id is not caller-supplied: it comes
 * from a token the Auth server has just verified.
 */
export const findProfileById = async (userId: string): Promise<Profile | null> => {
  const { data, error } = await getDatabaseClient()
    .from('profiles')
    .select('id, email, role, onboarding_status')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw toAppError(error, 'profiles.findProfileById', 'Profile');
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    email: data.email,
    role: data.role,
    onboardingStatus: data.onboarding_status,
  };
};

/**
 * Creates the SetuX profile for a newly registered identity.
 *
 * `role` is supplied by the service, never by a request. The insert runs
 * through the service-role client because `profiles` has no INSERT policy by
 * design — a browser must not be able to choose its own role
 * (`supabase/migrations/…_setux_rls.sql`).
 */
export const insertProfile = async (params: {
  readonly id: string;
  readonly email: string;
  readonly role: UserRole;
}): Promise<Profile> => {
  const { data, error } = await getDatabaseClient()
    .from('profiles')
    .insert({
      id: params.id,
      email: params.email,
      role: params.role,
      onboarding_status: 'NOT_STARTED',
    })
    .select('id, email, role, onboarding_status')
    .single();

  if (error) {
    throw toAppError(error, 'profiles.insertProfile', 'Profile');
  }

  return {
    id: data.id,
    email: data.email,
    role: data.role,
    onboardingStatus: data.onboarding_status,
  };
};
