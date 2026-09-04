import { DatabaseError, getDatabaseClient, toAppError } from '../../database/index.js';
import { logger } from '../../shared/logger/index.js';
import type { OnboardingStatus, UserRole } from '../auth/auth.types.js';
import type { CitizenProfileData, GovernmentProfileData } from './onboarding.types.js';

/**
 * Persistence for onboarding.
 *
 * Every function here takes the owner's id as an explicit argument and filters
 * on it. That id always originates from a verified token by the time it reaches
 * this layer (`requireAuth` → controller → service → repository), so no query
 * below can be widened by a request.
 *
 * These queries run through the service-role client and therefore bypass RLS.
 * RLS remains enabled and remains meaningful: it is what protects these tables
 * from the browser's own Supabase client, which is a separate path with a
 * separate identity (security-design.md §19). The `user_id` filters here are
 * the backend's equivalent of those policies, not a substitute for them.
 */

/**
 * An ACTIVE organization identified by its code, or `null` when no such
 * organization is registered.
 *
 * An officer must not be able to onboard into an organization that has been
 * retired, so the status filter is part of the lookup rather than a later
 * check.
 */
export const findActiveOrganizationByCode = async (
  organizationCode: string,
): Promise<{ readonly id: string; readonly name: string } | null> => {
  const { data, error } = await getDatabaseClient()
    .from('organizations')
    .select('id, name')
    .eq('code', organizationCode)
    .eq('status', 'ACTIVE')
    .maybeSingle();

  if (error) {
    throw toAppError(error, 'organizations.findActiveOrganizationByCode', 'Organization');
  }

  return data ? { id: data.id, name: data.name } : null;
};

/**
 * A department of one specific organization, looked up by name.
 *
 * Scoping the query to `organizationId` is the point: a department name that
 * exists under a *different* organization must not resolve, or an officer could
 * borrow one organization's code and another's department (onboarding.md §18).
 */
export const findDepartmentByName = async (params: {
  readonly organizationId: string;
  readonly departmentName: string;
}): Promise<{ readonly id: string; readonly name: string } | null> => {
  const { data, error } = await getDatabaseClient()
    .from('departments')
    .select('id, name')
    .eq('organization_id', params.organizationId)
    .eq('name', params.departmentName)
    .maybeSingle();

  if (error) {
    throw toAppError(error, 'departments.findDepartmentByName', 'Department');
  }

  return data ? { id: data.id, name: data.name } : null;
};

/**
 * The department names belonging to one organization, for the form's picker.
 *
 * No personal data is involved — `organizations` and `departments` are
 * reference tables readable by any authenticated user under RLS.
 */
export const listDepartmentNames = async (
  organizationId: string,
): Promise<readonly string[]> => {
  const { data, error } = await getDatabaseClient()
    .from('departments')
    .select('name')
    .eq('organization_id', organizationId)
    .order('name');

  if (error) {
    throw toAppError(error, 'departments.listDepartmentNames', 'Department');
  }

  return data.map((department) => department.name);
};

/** Loads the caller's citizen onboarding record, or `null` if not started. */
export const findCitizenProfile = async (userId: string): Promise<CitizenProfileData | null> => {
  const { data, error } = await getDatabaseClient()
    .from('citizen_profiles')
    .select('full_name, government_id, mobile_number, date_of_birth')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw toAppError(error, 'citizen_profiles.findCitizenProfile', 'Citizen profile');
  }

  if (!data) {
    return null;
  }

  return {
    fullName: data.full_name,
    governmentId: data.government_id,
    mobileNumber: data.mobile_number,
    dateOfBirth: data.date_of_birth,
  };
};

/**
 * Loads the caller's officer onboarding record, or `null` if not started.
 *
 * The organization and department are resolved back to the *names* the form
 * displays. Their UUIDs stay in this layer: a client that has never been handed
 * an organization id cannot try to submit one (onboarding.md §18).
 */
export const findGovernmentProfile = async (
  userId: string,
): Promise<GovernmentProfileData | null> => {
  const client = getDatabaseClient();

  const { data, error } = await client
    .from('government_profiles')
    .select(
      'organization_id, department_id, full_name, employee_id, designation, official_mobile_number',
    )
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw toAppError(error, 'government_profiles.findGovernmentProfile', 'Officer profile');
  }

  if (!data) {
    return null;
  }

  const [organization, department] = await Promise.all([
    client
      .from('organizations')
      .select('name, code')
      .eq('id', data.organization_id)
      .maybeSingle(),
    client.from('departments').select('name').eq('id', data.department_id).maybeSingle(),
  ]);

  if (organization.error) {
    throw toAppError(organization.error, 'organizations.findById', 'Organization');
  }
  if (department.error) {
    throw toAppError(department.error, 'departments.findById', 'Department');
  }

  return {
    // The foreign keys are NOT NULL and ON DELETE RESTRICT, so a saved profile
    // always has both rows behind it; the fallbacks only keep the type honest.
    organizationName: organization.data?.name ?? '',
    organizationCode: organization.data?.code ?? '',
    department: department.data?.name ?? '',
    fullName: data.full_name,
    employeeId: data.employee_id,
    designation: data.designation,
    officialMobileNumber: data.official_mobile_number,
  };
};

/**
 * PostgREST's code for "no such function in the schema cache".
 *
 * Raised when `supabase/migrations/20260903090000_setux_onboarding_functions.sql`
 * has not yet been applied to the target project.
 */
const PGRST_FUNCTION_MISSING = 'PGRST202';

const isFunctionMissing = (error: { code?: string } | null): boolean =>
  error?.code === PGRST_FUNCTION_MISSING;

/**
 * Creates or corrects the citizen record and marks onboarding COMPLETED.
 *
 * Both writes are needed for a consistent result: a `citizen_profiles` row with
 * `profiles.onboarding_status` still NOT_STARTED would leave the user looping
 * back through a form they have already filled in (Phase 4 §25).
 *
 * Preferred path is the `complete_citizen_onboarding` PostgreSQL function,
 * which applies the pair in one statement and is therefore atomic. Where that
 * migration has not been applied, the two writes are issued in a **recoverable
 * order** instead: the profile row first, the status flag second.
 *
 * That order is what makes the fallback safe rather than merely shorter. If the
 * second write fails, the user is left IN_PROGRESS with their data saved — they
 * return to the form, it is prefilled, and resubmitting upserts the same row
 * and retries the flag. The reverse order would mark someone COMPLETED with no
 * profile behind them, which no retry could repair. Neither ordering can
 * produce a profile owned by the wrong user: `userId` is the authenticated
 * caller in both.
 *
 * @param params.userId the authenticated caller — never a request field
 */
export const completeCitizenOnboarding = async (params: {
  readonly userId: string;
  readonly fullName: string;
  readonly governmentId: string;
  readonly mobileNumber: string;
  readonly dateOfBirth: string;
}): Promise<void> => {
  const client = getDatabaseClient();

  const { error } = await client.rpc('complete_citizen_onboarding', {
    p_user_id: params.userId,
    p_full_name: params.fullName,
    p_government_id: params.governmentId,
    p_mobile_number: params.mobileNumber,
    p_date_of_birth: params.dateOfBirth,
  });

  if (!error) {
    return;
  }

  if (!isFunctionMissing(error)) {
    throw toAppError(error, 'rpc.complete_citizen_onboarding', 'Citizen profile');
  }

  logger.warn(
    { migration: '20260903090000_setux_onboarding_functions' },
    'Onboarding function not present; using the ordered two-step write',
  );

  const { error: profileError } = await client
    .from('citizen_profiles')
    .upsert(
      {
        user_id: params.userId,
        full_name: params.fullName,
        government_id: params.governmentId,
        mobile_number: params.mobileNumber,
        date_of_birth: params.dateOfBirth,
      },
      // Keyed on the UNIQUE owner column, so a resubmission corrects the
      // existing row rather than inserting a second one.
      { onConflict: 'user_id' },
    );

  if (profileError) {
    throw toAppError(profileError, 'citizen_profiles.upsert', 'Citizen profile');
  }

  await markOnboardingCompleted(params.userId, 'CITIZEN');
};

/**
 * Flips `profiles.onboarding_status` to COMPLETED for one user.
 *
 * The role is part of the predicate so this cannot complete an account of the
 * wrong kind on the strength of the other role's profile — the same guard the
 * SQL function applies.
 */
const markOnboardingCompleted = async (userId: string, role: UserRole): Promise<void> => {
  const { data, error } = await getDatabaseClient()
    .from('profiles')
    .update({ onboarding_status: 'COMPLETED' })
    .eq('id', userId)
    .eq('role', role)
    .select('id')
    .maybeSingle();

  if (error) {
    throw toAppError(error, 'profiles.markOnboardingCompleted', 'Profile');
  }

  if (!data) {
    // The id does not name a profile of this role. The caller authenticated, so
    // this is a data-consistency failure rather than an authorization one.
    throw new DatabaseError('Onboarding could not be completed for this account.');
  }
};

/**
 * Creates or corrects the officer record and marks onboarding COMPLETED.
 *
 * Same two paths and the same recoverable ordering as its citizen counterpart.
 *
 * `organizationId` and `departmentId` are the ids the service resolved from
 * persisted reference data. They are never taken from the request, and the
 * foreign keys on `government_profiles` reject either one if it does not name a
 * real row.
 */
export const completeGovernmentOnboarding = async (params: {
  readonly userId: string;
  readonly organizationId: string;
  readonly departmentId: string;
  readonly fullName: string;
  readonly employeeId: string;
  readonly designation: string;
  readonly officialMobileNumber: string;
}): Promise<void> => {
  const client = getDatabaseClient();

  const { error } = await client.rpc('complete_government_onboarding', {
    p_user_id: params.userId,
    p_organization_id: params.organizationId,
    p_department_id: params.departmentId,
    p_full_name: params.fullName,
    p_employee_id: params.employeeId,
    p_designation: params.designation,
    p_official_mobile_number: params.officialMobileNumber,
  });

  if (!error) {
    return;
  }

  if (!isFunctionMissing(error)) {
    throw toAppError(error, 'rpc.complete_government_onboarding', 'Officer profile');
  }

  logger.warn(
    { migration: '20260903090000_setux_onboarding_functions' },
    'Onboarding function not present; using the ordered two-step write',
  );

  // The department-belongs-to-organization check the SQL function performs. The
  // service has already verified it; repeated here so the fallback path carries
  // the same guarantee rather than relying on its caller.
  const department = await findDepartmentById(params.departmentId);

  if (!department || department.organizationId !== params.organizationId) {
    throw new DatabaseError('The department does not belong to the given organization.');
  }

  const { error: profileError } = await client.from('government_profiles').upsert(
    {
      user_id: params.userId,
      organization_id: params.organizationId,
      department_id: params.departmentId,
      full_name: params.fullName,
      employee_id: params.employeeId,
      designation: params.designation,
      official_mobile_number: params.officialMobileNumber,
    },
    { onConflict: 'user_id' },
  );

  if (profileError) {
    throw toAppError(profileError, 'government_profiles.upsert', 'Officer profile');
  }

  await markOnboardingCompleted(params.userId, 'GOVERNMENT_OFFICER');
};

/** The organization a department belongs to, for the pairing check above. */
const findDepartmentById = async (
  departmentId: string,
): Promise<{ readonly organizationId: string } | null> => {
  const { data, error } = await getDatabaseClient()
    .from('departments')
    .select('organization_id')
    .eq('id', departmentId)
    .maybeSingle();

  if (error) {
    throw toAppError(error, 'departments.findDepartmentById', 'Department');
  }

  return data ? { organizationId: data.organization_id } : null;
};

/**
 * Moves the caller's onboarding to IN_PROGRESS.
 *
 * Called when a user first opens the form, so a session abandoned half-way is
 * distinguishable from one never started (onboarding.md §8). Guarded on the
 * current status so it can never walk a COMPLETED profile backwards.
 */
export const markOnboardingInProgress = async (userId: string): Promise<OnboardingStatus> => {
  const { data, error } = await getDatabaseClient()
    .from('profiles')
    .update({ onboarding_status: 'IN_PROGRESS' })
    .eq('id', userId)
    .eq('onboarding_status', 'NOT_STARTED')
    .select('onboarding_status')
    .maybeSingle();

  if (error) {
    throw toAppError(error, 'profiles.markOnboardingInProgress', 'Profile');
  }

  // No row updated means the status was already IN_PROGRESS or COMPLETED, which
  // is not a failure — the caller keeps the status it already had.
  return data?.onboarding_status ?? 'IN_PROGRESS';
};
