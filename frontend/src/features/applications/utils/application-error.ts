import { ApiError } from '@/services/api-client';

export const applicationErrorMessage = (error: unknown): string => {
  if (!(error instanceof ApiError)) return 'The request could not be completed. Please try again.';
  if (error.code === 'APPLICATION_DUPLICATE_ACTIVE') return error.message;
  if (error.code === 'APPLICATION_INVALID_STATE' || error.code === 'APPLICATION_NOT_READY') return error.message;
  if (error.status === 404) return 'This application could not be found.';
  return error.status === 0 ? error.message : 'The request could not be completed. Please try again.';
};
