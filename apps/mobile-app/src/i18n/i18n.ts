/**
 * i18next Initialization — Kapter
 *
 * Bundles translations inline for mobile (no HTTP backend).
 * Detects device locale via expo-localization.
 * Must be imported before expo-router/entry (see entry.ts).
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { getLocales } from "expo-localization";

import en from "./locales/en/common.json";
import vi from "./locales/vi/common.json";
import enProcessing from "./locales/en/processing.json";
import viProcessing from "./locales/vi/processing.json";

export const defaultNS = "common" as const;

export const resources = {
  en: { common: en, processing: enProcessing },
  vi: { common: vi, processing: viProcessing },
} as const;

export const supportedLanguages = ["en", "vi"] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

/**
 * Detect device language and map to supported language.
 * Falls back to 'en' if device locale isn't supported.
 */
function getDeviceLanguage(): SupportedLanguage {
  const locales = getLocales();
  const deviceLang = locales[0]?.languageCode ?? "en";
  return supportedLanguages.includes(deviceLang as SupportedLanguage)
    ? (deviceLang as SupportedLanguage)
    : "en";
}

i18n.use(initReactI18next).init({
  lng: getDeviceLanguage(),
  fallbackLng: "en",
  ns: ["common", "processing"],
  defaultNS,
  resources,
  interpolation: {
    escapeValue: false, // React already handles XSS
  },
  react: {
    useSuspense: false, // Resources are bundled, no async loading needed
  },
});

export default i18n;
