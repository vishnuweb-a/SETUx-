import type { ErrorCode } from '../errors/index.js';

/** Success envelope defined in `docs/API/api-specification.md`. */
export interface ApiSuccessBody<TData> {
  readonly success: true;
  readonly data: TData;
  readonly message?: string;
}

/** Error envelope defined in `docs/ERROR-HANDLING/exception-handling.md`. */
export interface ApiErrorBody {
  readonly success: false;
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly details?: unknown;
    readonly requestId: string;
  };
}

export const successBody = <TData>(data: TData, message?: string): ApiSuccessBody<TData> =>
  message === undefined ? { success: true, data } : { success: true, data, message };

export const errorBody = (params: {
  code: ErrorCode;
  message: string;
  requestId: string;
  details?: unknown;
}): ApiErrorBody => ({
  success: false,
  error: {
    code: params.code,
    message: params.message,
    requestId: params.requestId,
    ...(params.details === undefined ? {} : { details: params.details }),
  },
});
