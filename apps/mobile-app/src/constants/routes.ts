export const ROUTES = {
  AUTH: "/(auth)/welcome",
  LOGIN: "/(auth)",
  VERIFY_OTP: "/(auth)/verify-otp",
  WELCOME: "/(auth)/welcome",
  ONBOARDING_APP_LANG: "/(app)/onboarding/app-language",
  ONBOARDING_TARGET_LANG: "/(app)/onboarding/target-language",
  ONBOARDING_LEARNING_LANGS: "/(app)/onboarding/learning-languages",
  HOME: "/(app)",
  PROCESSING: "/(app)/processing",
  PLAYER: "/(app)/player",
  MEDIA_PICKER: "/(app)/media-picker",
  SETTINGS: "/(app)/settings",
} as const;
