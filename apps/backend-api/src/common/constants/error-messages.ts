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
