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
import { useAuthStore } from "@/stores/auth.store";
import { hydrateLanguagePreference } from "@/hooks";
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
    if (!isHydrated) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (!isAuthenticated && !inAuthGroup) {
      router.replace(ROUTES.AUTH);
    } else if (isAuthenticated && inAuthGroup) {
      router.replace(ROUTES.HOME);
    }
  }, [isHydrated, isAuthenticated, segments, router]);

  if (!isHydrated || !isLanguageReady) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="auto" />
      <Slot />
    </QueryClientProvider>
  );
}
