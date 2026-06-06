/**
 * Standardized error messages for i18n-friendly frontend handling.
 * Use these constants instead of raw strings in exceptions.
 */

export const AUTH_ERRORS = {
  // Email already registered
  USER_EMAIL_EXISTS: 'emailAlreadyRegistered',
  // Registration pending verification. Please verify OTP sent to your email.
  REGISTRATION_PENDING_VERIFICATION: 'registrationPendingVerification',
  // Invalid or expired OTP
  OTP_INVALID: 'otpInvalid',
  // Please wait before requesting another verification code.
  OTP_RESEND_COOLDOWN: 'otpResendCooldown',
  // Too many resend attempts. Please try again later.
  OTP_RESEND_LIMIT_REACHED: 'otpResendLimitReached',
  // Incorrect email or password
  WRONG_CREDENTIALS: 'wrongCredentials',
  // Registration session expired. Please register again.
  REGISTRATION_EXPIRED: 'registrationExpired',
  // Invalid or expired refresh token
  REFRESH_TOKEN_INVALID: 'refreshTokenInvalid',
  // Authentication required
  UNAUTHORIZED: 'unauthorized',
  // User not found
  USER_NOT_FOUND: 'userNotFound',
  // Password must be at least 8 characters long and contain at least one uppercase letter...
  PASSWORD_INVALID: 'passwordTooWeak',
} as const;

export type AuthErrorKey = keyof typeof AUTH_ERRORS;

export const SUBSCRIPTION_ERRORS = {
  // System configuration error: default plan unavailable. Please contact support.
  DEFAULT_PLAN_UNAVAILABLE: 'defaultPlanUnavailable',
} as const;

export type SubscriptionErrorKey = keyof typeof SUBSCRIPTION_ERRORS;

export const MEDIA_ERRORS = {
  // No active subscription. Please choose a plan before processing media.
  SUBSCRIPTION_INACTIVE: 'subscriptionInactive',
  // Monthly quota exceeded. Please upgrade your plan.
  QUOTA_EXCEEDED: 'quotaExceeded',
  // File duration exceeds the current plan limit.
  DURATION_LIMIT_EXCEEDED: 'durationLimitExceeded',
  // Uploaded file not found. Please try uploading again.
  FILE_NOT_FOUND: 'fileNotFound',
  // Please provide a valid YouTube URL.
  INVALID_YOUTUBE_URL: 'invalidYoutubeUrl',
} as const;

export type MediaErrorKey = keyof typeof MEDIA_ERRORS;
