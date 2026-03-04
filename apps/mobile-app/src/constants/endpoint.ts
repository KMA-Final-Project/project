export const ENDPOINTS = {
  LOGIN: "/auth/login",
  REGISTER: "/auth/register",
  RESEND_OTP: "/auth/resend-otp",
  VERIFY_OTP: "/auth/verify",
  REFRESH_TOKENS: "/auth/refresh",
  LOGOUT: "/auth/logout",

  // Media
  MEDIA_LIST: "/media",
  MEDIA_PRESIGNED_URL: "/media/upload/presign",
  MEDIA_CONFIRM_UPLOAD: "/media/upload/confirm",
  MEDIA_SUBMIT_YOUTUBE: "/media/youtube",
  MEDIA_STATUS: (id: string) => `/media/${id}/status`,
  MEDIA_DETAIL: (id: string) => `/media/${id}`,
};
