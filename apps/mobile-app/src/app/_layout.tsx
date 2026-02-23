/**
 * Root Layout — Kapter
 *
 * Entry layout for expo-router.
 * Themes and i18n are already initialized via entry.ts.
 */
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      />
    </>
  );
}
