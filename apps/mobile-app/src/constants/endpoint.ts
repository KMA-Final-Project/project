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
  MEDIA_ARTIFACTS: (id: string) => `/media/${id}/artifacts`,
  MEDIA_DETAIL: (id: string) => `/media/${id}`,
  MEDIA_DOWNLOAD_URL: (id: string) => `/media/${id}/download-url`,
  MEDIA_STREAM_URL: (id: string) => `/media/${id}/stream-url`,
  MEDIA_EXPLAIN: (id: string) => `/media/${id}/explain`,
  MEDIA_EXPLAIN_HISTORY: (id: string) => `/media/${id}/explain/history`,
  MEDIA_EXPLAIN_FEEDBACK: (id: string) => `/media/${id}/explain/feedback`,
};
