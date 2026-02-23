/**
 * Design Tokens — Kapter
 *
 * Single source of truth for all visual constants.
 * Themes consume these tokens; components never use raw values.
 */

// ─── Brand Colors ───────────────────────────────────────────────
export const brand = {
  primary: "#208AEF", // Brand blue (from splash screen)
  primaryLight: "#5AAAF5",
  primaryDark: "#1668B8",
  secondary: "#FF6B35", // Warm accent — energy & motivation
  secondaryLight: "#FF9060",
  secondaryDark: "#D04F20",
} as const;

// ─── Palette ────────────────────────────────────────────────────
export const palette = {
  // Neutrals
  white: "#FFFFFF",
  black: "#000000",

  gray50: "#F9FAFB",
  gray100: "#F3F4F6",
  gray200: "#E5E7EB",
  gray300: "#D1D5DB",
  gray400: "#9CA3AF",
  gray500: "#6B7280",
  gray600: "#4B5563",
  gray700: "#374151",
  gray800: "#1F2937",
  gray900: "#111827",
  gray950: "#030712",

  // Semantic
  success: "#22C55E",
  successBg: "#F0FDF4",
  warning: "#F59E0B",
  warningBg: "#FFFBEB",
  error: "#EF4444",
  errorBg: "#FEF2F2",
  info: "#3B82F6",
  infoBg: "#EFF6FF",
} as const;

// ─── Typography ─────────────────────────────────────────────────
export const fontSizes = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  "2xl": 24,
  "3xl": 30,
  "4xl": 36,
} as const;

export const fontWeights = {
  regular: "400" as const,
  medium: "500" as const,
  semibold: "600" as const,
  bold: "700" as const,
};

export const lineHeights = {
  tight: 1.25,
  normal: 1.5,
  relaxed: 1.75,
} as const;

// ─── Spacing (4px base) ────────────────────────────────────────
export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
  24: 96,
} as const;

// ─── Border Radius ──────────────────────────────────────────────
export const radii = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  "2xl": 24,
  full: 9999,
} as const;
