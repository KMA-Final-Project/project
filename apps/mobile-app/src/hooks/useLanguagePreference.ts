/**
 * useLanguagePreference — Kapter
 *
 * Manages language preference with persistence.
 * Falls back to device locale via expo-localization.
 */
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SupportedLanguage } from "@/i18n";

const LANGUAGE_STORAGE_KEY = "@kapter/language-preference";

export function useLanguagePreference() {
  const { i18n } = useTranslation();
  const [isLoading, setIsLoading] = useState(true);

  // Load stored language on mount
  useEffect(() => {
    AsyncStorage.getItem(LANGUAGE_STORAGE_KEY)
      .then((stored) => {
        if (stored === "en" || stored === "vi") {
          i18n.changeLanguage(stored);
        }
        // If no stored preference, i18n.ts already set device locale
      })
      .catch(() => {
        // Silent fail — use device locale default
      })
      .finally(() => setIsLoading(false));
  }, [i18n]);

  const setLanguage = useCallback(
    async (lang: SupportedLanguage) => {
      await i18n.changeLanguage(lang);

      try {
        await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
      } catch {
        // Silent fail
      }
    },
    [i18n],
  );

  return {
    currentLanguage: i18n.language as SupportedLanguage,
    isLoading,
    setLanguage,
  };
}
