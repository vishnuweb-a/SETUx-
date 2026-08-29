import type { Request, Response } from 'express';
import { HTTP_STATUS } from '../../shared/constants/index.js';
import { MissingTokenError } from '../../shared/errors/index.js';
import { successBody } from '../../shared/utils/index.js';
import type { LoginInput, SignupInput } from './auth.schema.js';
import { signIn, signOut, signUpCitizen, toCurrentUserPayload } from './auth.service.js';

/**
 * `POST /api/v1/auth/login` — exchanges credentials for a session.
 *
 * The password reaches Supabase Auth and is never written to a log, a database
 * column, or a response (auth-api.md §30).
 */
export const handleLogin = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as LoginInput;
  const result = await signIn(email, password);

  res.status(HTTP_STATUS.OK).json(successBody(result, 'Signed in successfully.'));
};

/**
 * `GET /api/v1/auth/me` — returns the authenticated user and their resolved role.
 *
 * The payload is built from `req.auth`, which `requireAuth` derived from a
 * verified token; nothing in the request influences it.
 */
export const handleGetCurrentUser = async (req: Request, res: Response): Promise<void> => {
  if (!req.auth) {
    throw new MissingTokenError();
  }

  res.status(HTTP_STATUS.OK).json(successBody(toCurrentUserPayload(req.auth)));
};

/**
 * `POST /api/v1/auth/logout` — revokes the caller's session.
 *
 * Revoking server-side matters: without it, an access token stays valid until
 * it expires even though the browser has forgotten it.
 */
export const handleLogout = async (req: Request, res: Response): Promise<void> => {
  const header = req.header('authorization') ?? '';
  await signOut(header.slice('bearer '.length).trim());

  res.status(HTTP_STATUS.OK).json(successBody(null, 'Logged out successfully.'));
};

/**
 * `POST /api/v1/auth/signup` — registers a new citizen account.
 *
 * Always creates a CITIZEN. The response echoes the role that was actually
 * created so a client cannot be left believing it obtained something else.
 */
export const handleSignup = async (req: Request, res: Response): Promise<void> => {
  const { email, password, fullName } = req.body as SignupInput;
  const result = await signUpCitizen({ email, password, fullName });

  res
    .status(HTTP_STATUS.CREATED)
    .json(successBody(result, 'Account created. You can now sign in.'));
};
