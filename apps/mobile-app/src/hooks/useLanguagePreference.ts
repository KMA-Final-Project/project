/**
 * useLanguagePreference — Kapter
 *
 * Manages language preference with persistence.
 * Falls back to device locale via expo-localization.
 */
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { i18n as i18nInstance } from "@/i18n";
import type { SupportedLanguage } from "@/i18n";

const LANGUAGE_STORAGE_KEY = "@kapter/language-preference";

let hydrationPromise: Promise<void> | null = null;
let hasHydratedLanguagePreference = false;

function isSupportedLanguage(value: string | null): value is SupportedLanguage {
  return value === "en" || value === "vi";
}

function getCurrentLanguage(language: string | undefined): SupportedLanguage {
  const normalizedLanguage = language ?? null;
  return isSupportedLanguage(normalizedLanguage) ? normalizedLanguage : "en";
}

export async function hydrateLanguagePreference(): Promise<void> {
  if (hasHydratedLanguagePreference) {
    return;
  }

  if (!hydrationPromise) {
    hydrationPromise = AsyncStorage.getItem(LANGUAGE_STORAGE_KEY)
      .then(async (stored) => {
        if (
          isSupportedLanguage(stored) &&
          i18nInstance.resolvedLanguage !== stored
        ) {
          await i18nInstance.changeLanguage(stored);
        }
      })
      .catch(() => {
        // Silent fail — use device locale default
      })
      .finally(() => {
        hasHydratedLanguagePreference = true;
      });
  }

  await hydrationPromise;
}

export function useLanguagePreference() {
  const { i18n } = useTranslation();
  const [isLoading, setIsLoading] = useState(!hasHydratedLanguagePreference);

  useEffect(() => {
    let isMounted = true;

    hydrateLanguagePreference().finally(() => {
      if (isMounted) {
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [i18n]);

  const setLanguage = useCallback(
    async (lang: SupportedLanguage) => {
      hasHydratedLanguagePreference = true;

      if (i18n.resolvedLanguage !== lang) {
        await i18n.changeLanguage(lang);
      }

      try {
        await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
      } catch {
        // Silent fail
      }
    },
    [i18n],
  );

  return {
    currentLanguage: getCurrentLanguage(i18n.resolvedLanguage ?? i18n.language),
    isLoading,
    setLanguage,
  };
}
