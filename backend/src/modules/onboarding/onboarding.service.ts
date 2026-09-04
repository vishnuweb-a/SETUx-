import {
  ConflictError,
  OnboardingAlreadyCompletedError,
  OnboardingDuplicateIdentifierError,
  OnboardingRoleMismatchError,
  OnboardingValidationError,
} from '../../shared/errors/index.js';
import { logger } from '../../shared/logger/index.js';
import { USER_ROLES, type AuthContext, type UserRole } from '../auth/auth.types.js';
import type {
  CitizenOnboardingInput,
  CitizenOnboardingPatchInput,
  GovernmentOnboardingInput,
  GovernmentOnboardingPatchInput,
} from './onboarding.schema.js';
import {
  completeCitizenOnboarding,
  completeGovernmentOnboarding,
  findActiveOrganizationByCode,
  findCitizenProfile,
  findDepartmentByName,
  findGovernmentProfile,
  listDepartmentNames,
  markOnboardingInProgress,
} from './onboarding.repository.js';
import {
  DASHBOARD_PATHS,
  type OnboardingCompletionPayload,
  type OnboardingProfilePayload,
  type OnboardingStatusPayload,
  type ResolvedOrganization,
} from './onboarding.types.js';

/**
 * Onboarding business logic.
 *
 * Every function takes the trusted {@link AuthContext} rather than a user id and
 * a role as separate arguments. That is deliberate: `AuthContext` can only be
 * produced by `requireAuth` from a verified token, so there is no way to call
 * into this layer with an identity a request supplied (onboarding.md §4, §39).
 *
 * What is logged: the internal user UUID, the role, and the outcome. What is
 * never logged: a government id, an employee id, a mobile number, a date of
 * birth, a name, or any token (onboarding.md §40, security-design.md §13).
 */

/** Asserts the caller's resolved role matches the flow they are addressing. */
const assertRole = (auth: AuthContext, expected: UserRole): void => {
  if (auth.role !== expected) {
    // The route's `requireRole` normally rejects this first; the check is
    // repeated here so the service is safe on its own terms and cannot be
    // mis-wired into an unguarded route later (onboarding.md §27).
    logger.warn(
      { userId: auth.userId, actualRole: auth.role, expectedRole: expected },
      'Onboarding flow does not match resolved role',
    );
    throw new OnboardingRoleMismatchError();
  }
};

/**
 * Rejects a POST from someone who has already finished onboarding.
 *
 * A completed profile is not overwritten by a second POST: that request is
 * either a double submit or an attempt to replace persisted identity data, and
 * neither should rewrite it silently (onboarding.md §26). Corrections while
 * onboarding is still open go through PATCH.
 */
const assertNotAlreadyCompleted = (auth: AuthContext): void => {
  if (auth.onboardingStatus === 'COMPLETED') {
    logger.info({ userId: auth.userId }, 'Onboarding submitted for an already completed profile');
    throw new OnboardingAlreadyCompletedError();
  }
};

/**
 * `GET /onboarding/status` — the trusted answer to "must this user onboard?"
 *
 * Read straight from the context the token resolved to, which is read from
 * `profiles`. It is never influenced by anything the client sends or stores,
 * which is what makes it safe to route on (Phase 4 §12).
 */
export const getOnboardingStatus = (auth: AuthContext): OnboardingStatusPayload => ({
  status: auth.onboardingStatus,
  role: auth.role,
  email: auth.email,
});

/**
 * `GET /onboarding/profile` — whatever the caller has saved so far.
 *
 * Reads the record for the authenticated id and no other, so this endpoint
 * cannot be used to read another user's profile however the request is shaped.
 *
 * Opening the form is also what moves a NOT_STARTED profile to IN_PROGRESS, so
 * a user who abandons the form half-way is distinguishable from one who never
 * began (onboarding.md §8).
 */
export const getOnboardingProfile = async (
  auth: AuthContext,
): Promise<OnboardingProfilePayload> => {
  const profile =
    auth.role === USER_ROLES.CITIZEN
      ? await findCitizenProfile(auth.userId)
      : await findGovernmentProfile(auth.userId);

  const status =
    auth.onboardingStatus === 'NOT_STARTED'
      ? await markOnboardingInProgress(auth.userId)
      : auth.onboardingStatus;

  return { status, role: auth.role, profile };
};

/**
 * The departments the form may offer for an organization code.
 *
 * Exists so the officer form can present a picker of real departments instead
 * of a free-text box the user has to guess at — the department must resolve
 * against persisted reference data for onboarding to succeed, so showing the
 * valid set is both kinder and more secure than validating a guess.
 *
 * An unknown code yields an empty list rather than an error: typing a code
 * one character at a time is normal, and a 404 per keystroke is not an error
 * condition.
 */
export const getOrganizationDepartments = async (
  organizationCode: string,
): Promise<{
  readonly organizationName: string | null;
  readonly departments: readonly string[];
}> => {
  const organization = await findActiveOrganizationByCode(organizationCode);

  if (!organization) {
    return { organizationName: null, departments: [] };
  }

  return {
    organizationName: organization.name,
    departments: await listDepartmentNames(organization.id),
  };
};

/**
 * Turns a client-supplied organization code, organization name and department
 * name into the foreign keys `government_profiles` requires.
 *
 * **This function is the organization-escalation boundary** (onboarding.md §18,
 * Phase 4 §18). Three properties matter:
 *
 * 1. The client never sends an id. It sends a *code*, which must match a row in
 *    `organizations`; an unregistered code cannot be onboarded into, so a user
 *    cannot invent an organization or attach themselves to one by guessing a
 *    UUID.
 * 2. The department is resolved **within** the organization just found, so a
 *    department belonging to another organization does not resolve.
 * 3. The submitted organization *name* must match the registered name. The
 *    registered name is what SetuX trusts and displays; accepting a different
 *    one would let an officer's profile assert an affiliation the reference
 *    data does not support.
 *
 * Failures are reported per field so the form can point at the problem, and
 * without disclosing which organizations exist beyond the one the user named.
 */
const resolveOrganization = async (params: {
  readonly auth: AuthContext;
  readonly organizationCode: string;
  readonly organizationName: string;
  readonly department: string;
}): Promise<ResolvedOrganization> => {
  const organization = await findActiveOrganizationByCode(params.organizationCode);

  if (!organization) {
    logger.warn(
      { userId: params.auth.userId },
      'Onboarding rejected: organization code is not registered',
    );
    throw new OnboardingValidationError('Please correct the highlighted fields.', {
      organizationCode: 'This organization code is not registered with SetuX.',
    });
  }

  // Compared case- and whitespace-insensitively: the user is retyping a name
  // they read off a letterhead, and "Department of Education " should not fail.
  const namesMatch =
    organization.name.trim().toLowerCase() === params.organizationName.trim().toLowerCase();

  if (!namesMatch) {
    logger.warn(
      { userId: params.auth.userId, organizationId: organization.id },
      'Onboarding rejected: organization name does not match the registered organization',
    );
    throw new OnboardingValidationError('Please correct the highlighted fields.', {
      organizationName: `This code is registered to a different organization name.`,
    });
  }

  const department = await findDepartmentByName({
    organizationId: organization.id,
    departmentName: params.department,
  });

  if (!department) {
    logger.warn(
      { userId: params.auth.userId, organizationId: organization.id },
      'Onboarding rejected: department does not belong to the organization',
    );
    throw new OnboardingValidationError('Please correct the highlighted fields.', {
      department: 'This department is not registered under that organization.',
    });
  }

  return {
    organizationId: organization.id,
    organizationName: organization.name,
    departmentId: department.id,
    departmentName: department.name,
  };
};

/**
 * Re-reports a unique-constraint conflict as a field-level onboarding error.
 *
 * `toAppError` turns a 23505 into a generic {@link ConflictError} on purpose —
 * it must not leak constraint names to a client. But onboarding *knows* which
 * identifier the caller just submitted, so it can name the field without
 * disclosing anything about the schema or about who holds the value
 * (onboarding.md §30, §38).
 *
 * Anything that is not a conflict is rethrown untouched.
 */
const asDuplicateIdentifier = (
  error: unknown,
  field: string,
  message: string,
): never => {
  if (error instanceof ConflictError) {
    throw new OnboardingDuplicateIdentifierError(message, { [field]: message });
  }

  throw error;
};

/** The trusted destination for a completed profile (onboarding.md §14, §20). */
const completionPayload = (role: UserRole): OnboardingCompletionPayload => ({
  onboardingStatus: 'COMPLETED',
  role,
  redirect: DASHBOARD_PATHS[role],
});

/**
 * `POST /onboarding/citizen` — creates the citizen profile and completes
 * onboarding.
 *
 * The owner is `auth.userId` and cannot be anything else: the input type has no
 * user field for a caller to populate.
 */
export const submitCitizenOnboarding = async (params: {
  readonly auth: AuthContext;
  readonly input: CitizenOnboardingInput;
}): Promise<OnboardingCompletionPayload> => {
  assertRole(params.auth, USER_ROLES.CITIZEN);
  assertNotAlreadyCompleted(params.auth);

  try {
    await completeCitizenOnboarding({
      userId: params.auth.userId,
      ...params.input,
    });
  } catch (error) {
    asDuplicateIdentifier(
      error,
      'governmentId',
      'This government ID is already registered with SetuX.',
    );
  }

  // Field values are deliberately absent: this line records that onboarding
  // completed, not what the citizen's government id is (onboarding.md §39).
  logger.info({ userId: params.auth.userId, event: 'CITIZEN_PROFILE_CREATED' }, 'Onboarding completed');

  return completionPayload(USER_ROLES.CITIZEN);
};

/**
 * `PATCH /onboarding/citizen` — corrects an in-progress citizen profile.
 *
 * The merge is read-then-write rather than a partial update because the
 * underlying operation completes onboarding, and completing it requires every
 * field. A PATCH before anything has been saved therefore has nothing to merge
 * into and is reported as a validation failure rather than writing a
 * half-populated row.
 */
export const updateCitizenOnboarding = async (params: {
  readonly auth: AuthContext;
  readonly input: CitizenOnboardingPatchInput;
}): Promise<OnboardingCompletionPayload> => {
  assertRole(params.auth, USER_ROLES.CITIZEN);

  const existing = await findCitizenProfile(params.auth.userId);

  if (!existing) {
    throw new OnboardingValidationError(
      'Complete your profile before updating it.',
    );
  }

  try {
    await completeCitizenOnboarding({
      userId: params.auth.userId,
      fullName: params.input.fullName ?? existing.fullName,
      governmentId: params.input.governmentId ?? existing.governmentId,
      mobileNumber: params.input.mobileNumber ?? existing.mobileNumber,
      // `date_of_birth` is nullable in the schema but required by the form, so
      // a stored null can only come from data created outside this flow.
      dateOfBirth: params.input.dateOfBirth ?? existing.dateOfBirth ?? '',
    });
  } catch (error) {
    asDuplicateIdentifier(
      error,
      'governmentId',
      'This government ID is already registered with SetuX.',
    );
  }

  logger.info({ userId: params.auth.userId, event: 'CITIZEN_PROFILE_UPDATED' }, 'Onboarding updated');

  return completionPayload(USER_ROLES.CITIZEN);
};

/**
 * `POST /onboarding/government` — creates the officer profile and completes
 * onboarding.
 *
 * The organization relationship is established by {@link resolveOrganization}
 * from persisted reference data, never from an id in the request. Note also
 * what this function does NOT do: it never writes `profiles.role`. Government
 * access is provisioned before onboarding (auth-api.md §11); onboarding
 * collects an already-authorized officer's details and grants nothing.
 */
export const submitGovernmentOnboarding = async (params: {
  readonly auth: AuthContext;
  readonly input: GovernmentOnboardingInput;
}): Promise<OnboardingCompletionPayload> => {
  assertRole(params.auth, USER_ROLES.GOVERNMENT_OFFICER);
  assertNotAlreadyCompleted(params.auth);

  const organization = await resolveOrganization({
    auth: params.auth,
    organizationCode: params.input.organizationCode,
    organizationName: params.input.organizationName,
    department: params.input.department,
  });

  try {
    await completeGovernmentOnboarding({
      userId: params.auth.userId,
      organizationId: organization.organizationId,
      departmentId: organization.departmentId,
      fullName: params.input.fullName,
      employeeId: params.input.employeeId,
      designation: params.input.designation,
      officialMobileNumber: params.input.officialMobileNumber,
    });
  } catch (error) {
    asDuplicateIdentifier(
      error,
      'employeeId',
      'This employee ID is already registered for that organization.',
    );
  }

  // The organization id is safe to log — it is reference data, not personal
  // information — and it is what makes an access review possible later.
  logger.info(
    {
      userId: params.auth.userId,
      organizationId: organization.organizationId,
      departmentId: organization.departmentId,
      event: 'GOVERNMENT_PROFILE_CREATED',
    },
    'Onboarding completed',
  );

  return completionPayload(USER_ROLES.GOVERNMENT_OFFICER);
};

/** `PATCH /onboarding/government` — corrects an in-progress officer profile. */
export const updateGovernmentOnboarding = async (params: {
  readonly auth: AuthContext;
  readonly input: GovernmentOnboardingPatchInput;
}): Promise<OnboardingCompletionPayload> => {
  assertRole(params.auth, USER_ROLES.GOVERNMENT_OFFICER);

  const existing = await findGovernmentProfile(params.auth.userId);

  if (!existing) {
    throw new OnboardingValidationError('Complete your profile before updating it.');
  }

  // Re-resolved on every update, including when the organization fields were
  // not part of the patch: the stored affiliation must still be valid reference
  // data, and re-checking is what stops a retired organization persisting.
  const organization = await resolveOrganization({
    auth: params.auth,
    organizationCode: params.input.organizationCode ?? existing.organizationCode,
    organizationName: params.input.organizationName ?? existing.organizationName,
    department: params.input.department ?? existing.department,
  });

  try {
    await completeGovernmentOnboarding({
      userId: params.auth.userId,
      organizationId: organization.organizationId,
      departmentId: organization.departmentId,
      fullName: params.input.fullName ?? existing.fullName,
      employeeId: params.input.employeeId ?? existing.employeeId,
      designation: params.input.designation ?? existing.designation,
      officialMobileNumber: params.input.officialMobileNumber ?? existing.officialMobileNumber,
    });
  } catch (error) {
    asDuplicateIdentifier(
      error,
      'employeeId',
      'This employee ID is already registered for that organization.',
    );
  }

  logger.info(
    {
      userId: params.auth.userId,
      organizationId: organization.organizationId,
      event: 'GOVERNMENT_PROFILE_UPDATED',
    },
    'Onboarding updated',
  );

  return completionPayload(USER_ROLES.GOVERNMENT_OFFICER);
};
