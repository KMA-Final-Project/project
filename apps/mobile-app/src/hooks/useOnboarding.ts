import { useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

const ONBOARDING_COMPLETED_KEY = "@kapter/onboarding-completed";
const DEFAULT_TARGET_LANG_KEY = "@kapter/default-target-language";
const LEARNING_LANGS_KEY = "@kapter/learning-languages";

interface OnboardingState {
  hasCompletedOnboarding: boolean | null;
  defaultTargetLanguage: string;
  learningLanguages: string[];
  isLoading: boolean;
  setHasCompletedOnboarding: (val: boolean | null) => void;
  setDefaultTargetLanguage: (lang: string) => void;
  setLearningLanguages: (langs: string[]) => void;
  setIsLoading: (loading: boolean) => void;
  initialize: () => Promise<void>;
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  hasCompletedOnboarding: null,
  defaultTargetLanguage: "vi",
  learningLanguages: [],
  isLoading: true,
  setHasCompletedOnboarding: (val) => set({ hasCompletedOnboarding: val }),
  setDefaultTargetLanguage: (lang) => set({ defaultTargetLanguage: lang }),
  setLearningLanguages: (langs) => set({ learningLanguages: langs }),
  setIsLoading: (loading) => set({ isLoading: loading }),

  initialize: async () => {
    // Avoid double initialization
    if (get().hasCompletedOnboarding !== null) {
      return;
    }
    try {
      const [completed, targetLang, learningLangs] = await Promise.all([
        AsyncStorage.getItem(ONBOARDING_COMPLETED_KEY),
        AsyncStorage.getItem(DEFAULT_TARGET_LANG_KEY),
        AsyncStorage.getItem(LEARNING_LANGS_KEY),
      ]);

      set({
        hasCompletedOnboarding: completed === "true",
        defaultTargetLanguage: targetLang !== null ? targetLang : "vi",
        learningLanguages:
          learningLangs !== null ? JSON.parse(learningLangs) : [],
        isLoading: false,
      });
    } catch {
      set({
        hasCompletedOnboarding: false,
        isLoading: false,
      });
    }
  },
}));

export function useOnboarding() {
  const store = useOnboardingStore();

  useEffect(() => {
    store.initialize();
  }, [store]);

  const completeOnboarding = useCallback(async () => {
    store.setHasCompletedOnboarding(true);
    try {
      await AsyncStorage.setItem(ONBOARDING_COMPLETED_KEY, "true");
    } catch {}
  }, [store]);

  const setTargetLanguage = useCallback(
    async (lang: string) => {
      store.setDefaultTargetLanguage(lang);
      try {
        await AsyncStorage.setItem(DEFAULT_TARGET_LANG_KEY, lang);
      } catch {}
    },
    [store],
  );

  const setLearningLangs = useCallback(
    async (langs: string[]) => {
      store.setLearningLanguages(langs);
      try {
        await AsyncStorage.setItem(LEARNING_LANGS_KEY, JSON.stringify(langs));
      } catch {}
    },
    [store],
  );

  const resetOnboarding = useCallback(async () => {
    store.setHasCompletedOnboarding(false);
    store.setLearningLanguages([]);
    try {
      await AsyncStorage.removeItem(ONBOARDING_COMPLETED_KEY);
      await AsyncStorage.removeItem(DEFAULT_TARGET_LANG_KEY);
      await AsyncStorage.removeItem(LEARNING_LANGS_KEY);
    } catch {}
  }, [store]);

  return {
    hasCompletedOnboarding: store.hasCompletedOnboarding,
    defaultTargetLanguage: store.defaultTargetLanguage,
    learningLanguages: store.learningLanguages,
    isLoading: store.isLoading,
    completeOnboarding,
    setTargetLanguage,
    setLearningLangs,
    resetOnboarding,
  };
}
