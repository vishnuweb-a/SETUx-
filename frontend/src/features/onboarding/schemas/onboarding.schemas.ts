import { z } from 'zod';

/**
 * Client-side onboarding validation.
 *
 * These schemas mirror `backend/src/modules/onboarding/onboarding.schema.ts`
 * field for field. That duplication is intentional and one-directional: the
 * browser copy exists so a user is told about a bad mobile number without a
 * round trip, while the backend copy is the one that decides what may be
 * stored. If the two ever disagree, the backend wins and the form shows the
 * error it returns (onboarding.md §28).
 *
 * Note what is absent from both: any field naming a user, a role, or an
 * onboarding status. Those come from the session.
 */

const fullName = z
  .string()
  .trim()
  .min(2, { error: 'Enter your full name.' })
  .max(120, { error: 'Full name is too long.' });

/**
 * A 10-digit Indian mobile number.
 *
 * The form renders a fixed `+91` prefix, so the user types the 10 digits only;
 * separators are stripped first so a pasted number is accepted rather than
 * rejected on formatting.
 */
const mobileNumber = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s\-()]/g, '').replace(/^(?:\+?91)/, ''))
  .refine((value) => /^[6-9]\d{9}$/.test(value), {
    error: 'Enter a valid 10-digit mobile number.',
  });

/**
 * A synthetic demo identifier.
 *
 * Deliberately not shaped like a real Aadhaar or PAN number: the prototype must
 * never invite a real one (AGENT.md §15).
 */
const governmentId = z
  .string()
  .trim()
  .toUpperCase()
  .min(6, { error: 'Government ID must be at least 6 characters.' })
  .max(32, { error: 'Government ID is too long.' })
  .regex(/^[A-Z0-9-]+$/, {
    error: 'Use letters, numbers and hyphens only.',
  });

const dateOfBirth = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Select your date of birth.' })
  .refine((value) => !Number.isNaN(Date.parse(value)), { error: 'Enter a valid date.' })
  .refine((value) => new Date(value) < new Date(), {
    error: 'Date of birth must be in the past.',
  })
  .refine((value) => new Date(value) > new Date('1900-01-01'), {
    error: 'Enter a valid date of birth.',
  });

/** Citizen onboarding form (onboarding.md §11). */
export const citizenOnboardingFormSchema = z.object({
  fullName,
  governmentId,
  mobileNumber,
  dateOfBirth,
});

export type CitizenOnboardingFormValues = z.infer<typeof citizenOnboardingFormSchema>;

/** Government officer onboarding form (onboarding.md §16). */
export const governmentOnboardingFormSchema = z.object({
  organizationName: z
    .string()
    .trim()
    .min(2, { error: 'Enter your organization name.' })
    .max(160, { error: 'Organization name is too long.' }),
  organizationCode: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, { error: 'Enter your organization ID or code.' })
    .max(32, { error: 'Organization code is too long.' }),
  department: z.string().trim().min(2, { error: 'Select your department or ministry.' }),
  fullName,
  employeeId: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, { error: 'Enter your employee ID.' })
    .max(32, { error: 'Employee ID is too long.' }),
  designation: z
    .string()
    .trim()
    .min(2, { error: 'Enter your designation or role.' })
    .max(120, { error: 'Designation is too long.' }),
  officialMobileNumber: mobileNumber,
});

export type GovernmentOnboardingFormValues = z.infer<typeof governmentOnboardingFormSchema>;

/**
 * Validates raw form state, returning either the parsed values or a
 * `{ field: message }` map.
 *
 * The error shape matches what the backend returns in `error.details`, so the
 * form renders client-side and server-side failures through exactly one code
 * path instead of two that drift apart.
 */
export const validateForm = <TSchema extends z.ZodType>(
  schema: TSchema,
  values: unknown,
):
  | { readonly ok: true; readonly data: z.output<TSchema> }
  | { readonly ok: false; readonly errors: Readonly<Record<string, string>> } => {
  const result = schema.safeParse(values);

  if (result.success) {
    return { ok: true, data: result.data };
  }

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const field = issue.path.join('.');
    // First message per field only: showing three complaints about one input
    // tells the user less than showing the first.
    errors[field] ??= issue.message;
  }

  return { ok: false, errors };
};
