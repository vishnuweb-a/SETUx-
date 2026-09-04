import { ApiError } from '@/services/api-client';

export const consentErrorMessage = (error: unknown): string => {
  if (!(error instanceof ApiError)) return 'The request could not be completed. Please try again.';
  if (error.code === 'CONSENT_ALREADY_DECIDED' || error.code === 'CONSENT_NOT_APPLICABLE') {
    return error.message;
  }
  // A consent or application belonging to someone else is concealed as absent
  // by the backend, so this message covers both.
  if (error.status === 404) return 'This consent request could not be found.';
  return error.status === 0 ? error.message : 'The request could not be completed. Please try again.';
};
