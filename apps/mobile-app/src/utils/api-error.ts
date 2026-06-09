import { isAxiosError } from "axios";
import i18n from "@/i18n/i18n";

/**
 * Extracts a standardized error code from an AxiosError.
 *
 * If the backend sends an error response like `{ "message": "Incorrect email or password", "error": "Unauthorized" }`,
 * or if we enforce an error code system eventually.
 * Currently we will map known backend strings to i18n keys for better UX.
 */
export function extractApiError(
  err: unknown,
  defaultMessageKey: string = "common.error",
): string {
  if (isAxiosError(err) && err.response?.data) {
    const backendMessage = err.response.data.message;

    const translateIfValidStr = (msg: unknown): string | null => {
      if (typeof msg === "string") {
        const i18nKey = `apiErrors.${msg}`;
        if (i18n.exists(i18nKey as never)) {
          return String(i18n.t(i18nKey as never));
        }
      }
      return null;
    };

    // NestJS validation pipe returns array of messages
    if (Array.isArray(backendMessage) && backendMessage.length > 0) {
      const translated = translateIfValidStr(backendMessage[0]);
      if (translated) return translated;

      if (typeof backendMessage[0] === "string") {
        return backendMessage[0];
      }
    }

    const translated = translateIfValidStr(backendMessage);
    if (translated) return translated;

    // Wrap backend message directly if string but not explicitly translated
    if (typeof backendMessage === "string") {
      return backendMessage;
    }
  }

  // Fallback
  return String(i18n.t(defaultMessageKey as never));
}
