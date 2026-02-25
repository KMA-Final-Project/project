/**
 * Unistyles Configuration — Kapter
 *
 * Registers themes and breakpoints with react-native-unistyles.
 * Must be imported before expo-router/entry (see entry.ts).
 */
import { StyleSheet } from "react-native-unistyles";
import { lightTheme } from "./light";
import { darkTheme } from "./dark";
import type { AppTheme } from "./light";

// ─── Breakpoints ────────────────────────────────────────────────
const breakpoints = {
  xs: 0, // Small phones
  sm: 380, // Standard phones
  md: 768, // Tablets
  lg: 1024, // Large tablets / small desktops
} as const;

// ─── Theme Registry ─────────────────────────────────────────────
const appThemes = {
  light: lightTheme,
  dark: darkTheme,
} as const;

// ─── TypeScript Module Augmentation ────────────────────────────
type AppBreakpoints = typeof breakpoints;
type AppThemes = typeof appThemes;

declare module "react-native-unistyles" {
  export interface UnistylesThemes extends AppThemes {}
  export interface UnistylesBreakpoints extends AppBreakpoints {}
}

// ─── Initialize ─────────────────────────────────────────────────
StyleSheet.configure({
  themes: appThemes,
  breakpoints,
  settings: {
    adaptiveThemes: true, // Automatically follows system light/dark preference
  },
});

export type { AppTheme };
export { lightTheme, darkTheme, breakpoints };
