import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth';
import { ApiError } from '@/services/api-client';
import type { OnboardingCompletionResponse, OnboardingFieldErrors } from '../types/onboarding.types';
import { toOnboardingErrorMessage, toOnboardingFieldErrors } from '../utils/onboarding-error';

export interface UseOnboardingSubmitResult {
  readonly isSubmitting: boolean;
  /** A message for the form-level alert, or `null`. */
  readonly errorMessage: string | null;
  /** Server-reported field errors, merged into the form's own. */
  readonly fieldErrors: OnboardingFieldErrors;
  readonly submit: (values: unknown) => Promise<void>;
  readonly clearErrors: () => void;
}

/**
 * Owns the submit half of an onboarding form: in-flight state, error mapping,
 * the trusted-state refresh, and navigation.
 *
 * Extracted from the pages because the citizen and officer forms differ only in
 * their fields and their endpoint. Everything that happens *after* submit is
 * identical, and the sequence matters:
 *
 *   submit → backend persists → refreshUser() → navigate(redirect)
 *
 * `refreshUser` before navigating is what prevents a redirect loop. The guard
 * routes on `user.onboardingStatus`; navigating first would hand the guard a
 * still-stale NOT_STARTED and bounce the user straight back to the form
 * (Phase 4 §38).
 */
export const useOnboardingSubmit = (
  submitFn: (values: never) => Promise<OnboardingCompletionResponse>,
): UseOnboardingSubmitResult => {
  const { refreshUser } = useAuth();
  const navigate = useNavigate();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<OnboardingFieldErrors>({});

  // A ref rather than the state flag: `isSubmitting` is one render behind, so a
  // second click in the same tick would slip past it and post twice
  // (Phase 4 §31).
  const inFlightRef = useRef(false);

  const clearErrors = useCallback(() => {
    setErrorMessage(null);
    setFieldErrors({});
  }, []);

  const submit = useCallback(
    async (values: unknown): Promise<void> => {
      if (inFlightRef.current) return;

      inFlightRef.current = true;
      setIsSubmitting(true);
      clearErrors();

      try {
        const result = await (submitFn as (v: unknown) => Promise<OnboardingCompletionResponse>)(
          values,
        );

        // The trusted state has changed server-side; re-read it before routing.
        await refreshUser();
        navigate(result.redirect, { replace: true });
      } catch (error) {
        // A session that expired mid-form is already being torn down by the API
        // client's 401 handler, which returns the user to the login screen. No
        // navigation here, or the two would race (Phase 4 §37).
        setErrorMessage(toOnboardingErrorMessage(error));
        setFieldErrors(toOnboardingFieldErrors(error));

        // An already-completed profile is not an error the user can act on:
        // they are simply finished, so send them where they belong.
        if (error instanceof ApiError && error.code === 'ONBOARDING_ALREADY_COMPLETED') {
          await refreshUser();
        }
      } finally {
        inFlightRef.current = false;
        setIsSubmitting(false);
      }
    },
    [clearErrors, navigate, refreshUser, submitFn],
  );

  return { isSubmitting, errorMessage, fieldErrors, submit, clearErrors };
};
