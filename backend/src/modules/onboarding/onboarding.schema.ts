import { z } from 'zod';

/**
 * Onboarding request schemas (onboarding.md §11, §16, §28, §29).
 *
 * Two rules shape every field here.
 *
 * First, **normalization happens in the schema**, not in the service: trimming
 * and case-folding an identifier after a uniqueness check has already run would
 * make the check meaningless, so the value the service receives is already the
 * value that will be stored and compared (onboarding.md §29).
 *
 * Second, there is deliberately **no `userId`, `role`, `email` or
 * `onboardingStatus` field** in any schema. Those are derived from the verified
 * session; a client has nowhere to put them, which is stronger than ignoring
 * them downstream (onboarding.md §39).
 */

/** Names are displayed, not matched, so only whitespace is normalized. */
const fullName = z
  .string()
  .trim()
  .min(2, { error: 'Enter your full name.' })
  .max(120, { error: 'Full name is too long.' });

/**
 * An Indian 10-digit mobile number, accepted with or without the `+91` the
 * form displays and stored as the bare 10 digits.
 *
 * Separators a user might type are stripped before validation, so a number
 * pasted as `98765 43210` is accepted rather than rejected on formatting.
 */
const mobileNumber = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s\-()]/g, '').replace(/^(?:\+?91)/, ''))
  .refine((value) => /^[6-9]\d{9}$/.test(value), {
    error: 'Enter a valid 10-digit Indian mobile number.',
  });

/**
 * A synthetic government identifier for the prototype.
 *
 * Uppercased so `gov123456` and `GOV123456` cannot both be registered — the
 * uniqueness constraint compares bytes, so the format has to be settled before
 * it is consulted (onboarding.md §29).
 *
 * The pattern deliberately does NOT encode a real Aadhaar or PAN format:
 * `docs/API/onboarding.md` §12 and AGENT.md §15 require synthetic demo values,
 * and a validator shaped like the real thing invites real ones.
 */
const governmentId = z
  .string()
  .trim()
  .toUpperCase()
  .min(6, { error: 'Government ID must be at least 6 characters.' })
  .max(32, { error: 'Government ID is too long.' })
  .regex(/^[A-Z0-9-]+$/, {
    error: 'Government ID may contain only letters, numbers and hyphens.',
  });

/**
 * Date of birth as ISO `YYYY-MM-DD`.
 *
 * The upper bound is a data-integrity rule the database also enforces
 * (`citizen_profiles_dob_in_past`); the lower bound rejects a date no living
 * applicant could hold and so catches a mistyped year rather than trusting it.
 */
const dateOfBirth = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Enter the date as YYYY-MM-DD.' })
  .refine((value) => !Number.isNaN(Date.parse(value)), { error: 'Enter a valid date.' })
  .refine((value) => new Date(value) < new Date(), {
    error: 'Date of birth must be in the past.',
  })
  .refine((value) => new Date(value) > new Date('1900-01-01'), {
    error: 'Enter a valid date of birth.',
  });

/**
 * An organization code, e.g. `EDU`.
 *
 * Uppercased for the same reason as the government ID: this value is looked up
 * against `organizations.code`, and the lookup must not depend on how the user
 * capitalised it. What it resolves to — or whether it resolves at all — is the
 * service's decision, not the schema's.
 */
const organizationCode = z
  .string()
  .trim()
  .toUpperCase()
  .min(2, { error: 'Enter your organization ID or code.' })
  .max(32, { error: 'Organization code is too long.' });

const employeeId = z
  .string()
  .trim()
  .toUpperCase()
  .min(2, { error: 'Enter your employee ID.' })
  .max(32, { error: 'Employee ID is too long.' });

/**
 * Citizen onboarding body (onboarding.md §11).
 *
 * `.strict()` rejects an unknown key rather than dropping it, so an attempt to
 * smuggle `role` or `user_id` through fails loudly instead of appearing to
 * succeed.
 */
export const citizenOnboardingSchema = z
  .object({
    fullName,
    governmentId,
    mobileNumber,
    dateOfBirth,
  })
  .strict();

export type CitizenOnboardingInput = z.infer<typeof citizenOnboardingSchema>;

/**
 * Citizen onboarding correction (onboarding.md §24).
 *
 * Every field is optional — a PATCH updates what it names — but at least one
 * must be present, because an empty PATCH is a mistake rather than a no-op the
 * caller intended.
 */
export const citizenOnboardingPatchSchema = citizenOnboardingSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    error: 'Provide at least one field to update.',
  });

export type CitizenOnboardingPatchInput = z.infer<typeof citizenOnboardingPatchSchema>;

/**
 * Government officer onboarding body (onboarding.md §16).
 *
 * `organizationName` and `department` are strings here and are *verified*
 * against persisted reference data by the service — the schema can confirm a
 * name is well-formed, but only the database can confirm the organization
 * exists and that the department belongs to it (onboarding.md §18).
 *
 * Note what is absent: `organizationId` and `departmentId`. The client supplies
 * a code and a name, never a foreign key, so it cannot attach itself to an
 * organization by guessing a UUID.
 */
export const governmentOnboardingSchema = z
  .object({
    organizationName: z
      .string()
      .trim()
      .min(2, { error: 'Enter your organization name.' })
      .max(160, { error: 'Organization name is too long.' }),
    organizationCode,
    department: z
      .string()
      .trim()
      .min(2, { error: 'Select your department or ministry.' })
      .max(160, { error: 'Department name is too long.' }),
    fullName,
    employeeId,
    designation: z
      .string()
      .trim()
      .min(2, { error: 'Enter your designation or role.' })
      .max(120, { error: 'Designation is too long.' }),
    officialMobileNumber: mobileNumber,
  })
  .strict();

export type GovernmentOnboardingInput = z.infer<typeof governmentOnboardingSchema>;

/** Government officer onboarding correction (onboarding.md §25). */
export const governmentOnboardingPatchSchema = governmentOnboardingSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    error: 'Provide at least one field to update.',
  });

export type GovernmentOnboardingPatchInput = z.infer<typeof governmentOnboardingPatchSchema>;

/**
 * Path params for the department lookup.
 *
 * Uppercased here for the same reason as the body field: the code is matched
 * against `organizations.code`, and the match must not depend on the casing in
 * the URL.
 */
export const organizationCodeParamsSchema = z.object({
  code: organizationCode,
});

export type OrganizationCodeParams = z.infer<typeof organizationCodeParamsSchema>;
