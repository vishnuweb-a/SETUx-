import { z } from 'zod';

/**
 * Sign-in payload (auth-api.md §14).
 *
 * Deliberately minimal: the request carries a credential and nothing else. In
 * particular there is no `role` field — a role sent by a client is not merely
 * ignored downstream, it has no place in the contract at all
 * (auth-api.md §11).
 */
export const loginSchema = z.object({
  email: z.email({ error: 'Enter a valid email address.' }).trim().toLowerCase(),
  password: z.string().min(1, { error: 'Password is required.' }),
});

export type LoginInput = z.infer<typeof loginSchema>;

/** Minimum password length. `auth-api.md` §10 requires "minimum security
 * requirements" without fixing a number; 8 is the shortest length Supabase
 * itself recommends. */
const MIN_PASSWORD_LENGTH = 8;

/**
 * Registration payload (auth-api.md §10).
 *
 * There is deliberately **no `role` field**. `auth-api.md` §11 and
 * `authentication-and-rbac.md` §16 require that government access be
 * provisioned through a controlled process, so self-service registration
 * creates a CITIZEN and nothing else. A role sent by a client is not merely
 * ignored downstream — the contract has no place to put it.
 */
export const signupSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(1, { error: 'Full name is required.' })
      .max(120, { error: 'Full name is too long.' }),
    email: z.email({ error: 'Enter a valid email address.' }).trim().toLowerCase(),
    password: z
      .string()
      .min(MIN_PASSWORD_LENGTH, {
        error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      })
      .max(72, { error: 'Password is too long.' }),
    confirmPassword: z.string(),
  })
  // Checked server-side too: the browser comparison is a convenience, not a
  // guarantee, and the request can be made without it.
  .refine((data) => data.password === data.confirmPassword, {
    error: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export type SignupInput = z.infer<typeof signupSchema>;
