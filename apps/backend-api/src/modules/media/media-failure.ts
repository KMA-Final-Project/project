import { MEDIA_ERRORS } from 'src/common/constants/error-messages';

export const MEDIA_FAILURE_CODES = {
  SUBSCRIPTION_INACTIVE: MEDIA_ERRORS.SUBSCRIPTION_INACTIVE,
  QUOTA_EXCEEDED: MEDIA_ERRORS.QUOTA_EXCEEDED,
  DURATION_LIMIT_EXCEEDED: MEDIA_ERRORS.DURATION_LIMIT_EXCEEDED,
  VALIDATION_FAILED: 'validationFailed',
  PROCESSING_FAILED: 'processingFailed',
} as const;

export type MediaFailureCode =
  (typeof MEDIA_FAILURE_CODES)[keyof typeof MEDIA_FAILURE_CODES];

export class MediaValidationError extends Error {
  constructor(
    public readonly code: MediaFailureCode,
    message: string,
  ) {
    super(message);
    this.name = 'MediaValidationError';
  }
}

export function inferMediaFailureCode(
  error: unknown,
  fallback: MediaFailureCode = MEDIA_FAILURE_CODES.VALIDATION_FAILED,
): MediaFailureCode {
  if (error instanceof MediaValidationError) {
    return error.code;
  }

  return fallback;
}
