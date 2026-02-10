/**
 * Standardized error messages for i18n-friendly frontend handling.
 * Use these constants instead of raw strings in exceptions.
 */

export const AUTH_ERRORS = {
  USER_EMAIL_EXISTS: 'Email already registered',
  OTP_INVALID: 'Invalid or expired OTP',
  WRONG_CREDENTIALS: 'Incorrect email or password',
  REGISTRATION_EXPIRED: 'Registration session expired. Please register again.',
  REFRESH_TOKEN_INVALID: 'Invalid or expired refresh token',
  UNAUTHORIZED: 'Authentication required',
  USER_NOT_FOUND: 'User not found',
  PASSWORD_INVALID:
    'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character',
} as const;

export type AuthErrorKey = keyof typeof AUTH_ERRORS;

export const SUBSCRIPTION_ERRORS = {
  DEFAULT_PLAN_UNAVAILABLE:
    'System configuration error: default plan unavailable. Please contact support.',
} as const;

export type SubscriptionErrorKey = keyof typeof SUBSCRIPTION_ERRORS;

export const MEDIA_ERRORS = {
  QUOTA_EXCEEDED: 'Monthly quota exceeded. Please upgrade your plan.',
  FILE_NOT_FOUND: 'Uploaded file not found. Please try uploading again.',
  INVALID_YOUTUBE_URL: 'Please provide a valid YouTube URL.',
} as const;

export type MediaErrorKey = keyof typeof MEDIA_ERRORS;
