/**
 * useThemePreference — Kapter
 *
 * Manages theme preference with persistence.
 * Supports: 'system' (default), 'light', 'dark'
 */
import { useState, useEffect, useCallback } from "react";
import { UnistylesRuntime } from "react-native-unistyles";
import AsyncStorage from "@react-native-async-storage/async-storage";

const THEME_STORAGE_KEY = "@kapter/theme-preference";

export type ThemePreference = "system" | "light" | "dark";

export function useThemePreference() {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [isLoading, setIsLoading] = useState(true);

  // Load stored preference on mount
  useEffect(() => {
    let isMounted = true;
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((stored) => {
        if (!isMounted) return;
        if (stored === "light" || stored === "dark" || stored === "system") {
          setPreference(stored);
          if (stored === "system") {
            UnistylesRuntime.setAdaptiveThemes(true);
          } else {
            UnistylesRuntime.setAdaptiveThemes(false);
            UnistylesRuntime.setTheme(stored);
          }
        } else {
          UnistylesRuntime.setAdaptiveThemes(true);
        }
      })
      .catch(() => {
        // Silent fail — use system default
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const setThemePreference = useCallback(async (mode: ThemePreference) => {
    setPreference(mode);

    if (mode === "system") {
      UnistylesRuntime.setAdaptiveThemes(true);
    } else {
      UnistylesRuntime.setAdaptiveThemes(false);
      UnistylesRuntime.setTheme(mode);
    }

    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      // Silent fail — preference won't persist but works in-session
    }
  }, []);

  return {
    preference,
    isLoading,
    setThemePreference,
  };
}
