/**
 * Dark Theme — Kapter
 */
import {
  brand,
  palette,
  fontSizes,
  fontWeights,
  lineHeights,
  spacing,
  radii,
  player,
} from "./tokens";
import type { AppTheme } from "./light";

export const darkTheme: AppTheme = {
  colors: {
    // Brand — slightly brighter in dark mode for contrast
    primary: brand.primaryLight,
    primaryLight: brand.primary,
    primaryDark: brand.primaryDark,
    secondary: brand.secondaryLight,
    secondaryLight: brand.secondary,
    secondaryDark: brand.secondaryDark,

    // Surfaces
    background: palette.gray950,
    surface: palette.gray900,
    card: palette.gray800,
    elevated: palette.gray700,

    // Text
    text: palette.gray50,
    textSecondary: palette.gray400,
    textTertiary: palette.gray600,
    textInverse: palette.gray900,
    textOnPrimary: palette.white,

    // Borders & Dividers
    border: palette.gray700,
    borderFocused: brand.primaryLight,
    divider: palette.gray800,

    // Semantic — slightly muted backgrounds for dark
    success: palette.success,
    successBg: "#052E16",
    warning: palette.warning,
    warningBg: "#451A03",
    error: palette.error,
    errorBg: "#450A0A",
    info: palette.info,
    infoBg: "#172554",

    // Interactive
    disabled: palette.gray700,
    disabledText: palette.gray600,
    placeholder: palette.gray600,
    backdrop: "rgba(0, 0, 0, 0.7)",

    // Navigation
    tabBar: palette.gray900,
    tabBarInactive: palette.gray600,
    tabBarActive: brand.primaryLight,
    statusBar: palette.gray950,

    player: {
      gradientStart: player.gradientStart,
      gradientEnd: player.gradientEnd,
      karaokeHighlight: player.karaokeHighlight,
      phoneticText: player.phoneticText,
      translationText: player.translationText,
      activeSentenceBg: player.activeSentenceBg,
    },
  },

  typography: {
    sizes: fontSizes,
    weights: fontWeights,
    lineHeights,
  },

  spacing,
  radii,

  gap: (v: number) => v * 4,
} as const;
