/**
 * Root Layout — Kapter
 *
 * Auth guard: redirects to (auth) when unauthenticated.
 * Themes and i18n are already initialized via entry.ts.
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Slot, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useAuthStore } from "@/stores/auth.store";
import { hydrateLanguagePreference, useOnboarding } from "@/hooks";
import { setAuthInvalidatedHandler } from "@/services";
import { ROUTES } from "../constants/routes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [isLanguageReady, setIsLanguageReady] = useState(false);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const hydrate = useAuthStore((s) => s.hydrate);
  const invalidate = useAuthStore((s) => s.invalidate);
  const { hasCompletedOnboarding, isLoading: isOnboardingLoading } = useOnboarding();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    let isMounted = true;

    hydrateLanguagePreference().finally(() => {
      if (isMounted) {
        setIsLanguageReady(true);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = setAuthInvalidatedHandler(async () => {
      invalidate();
    });

    return unsubscribe;
  }, [invalidate]);

  useEffect(() => {
    if (!isHydrated || isOnboardingLoading) return;

    const inAuthGroup = segments[0] === "(auth)";
    const inOnboardingFlow = (segments as string[])[1] === "onboarding";

    if (!isAuthenticated && !inAuthGroup) {
      router.replace(ROUTES.AUTH as any);
    } else if (isAuthenticated) {
      if (hasCompletedOnboarding === false && !inOnboardingFlow) {
        router.replace(ROUTES.ONBOARDING_APP_LANG as any);
      } else if (hasCompletedOnboarding === true && (inAuthGroup || inOnboardingFlow)) {
        router.replace(ROUTES.HOME as any);
      }
    }
  }, [isHydrated, isAuthenticated, segments, router, hasCompletedOnboarding, isOnboardingLoading]);

  if (!isHydrated || !isLanguageReady || isOnboardingLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="auto" />
        <Slot />
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
