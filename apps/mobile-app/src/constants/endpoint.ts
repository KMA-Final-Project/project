export const ENDPOINTS = {
  LOGIN: "/auth/login",
  REGISTER: "/auth/register",
  RESEND_OTP: "/auth/resend-otp",
  VERIFY_OTP: "/auth/verify",
  REFRESH_TOKENS: "/auth/refresh",
  LOGOUT: "/auth/logout",

  // Media
  MEDIA_LIST: "/media",
  MEDIA_PRESIGNED_URL: "/media/presigned-url",
  MEDIA_CONFIRM_UPLOAD: "/media/confirm-upload",
  MEDIA_SUBMIT_YOUTUBE: "/media/youtube",
  MEDIA_STATUS: (id: string) => `/media/${id}/status`,
  MEDIA_DETAIL: (id: string) => `/media/${id}`,
};
