/**
 * Light Theme — Kapter
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

// ─── Theme Shape (shared by light & dark) ───────────────────────
export interface AppTheme {
  colors: {
    primary: string;
    primaryLight: string;
    primaryDark: string;
    secondary: string;
    secondaryLight: string;
    secondaryDark: string;

    background: string;
    surface: string;
    card: string;
    elevated: string;

    text: string;
    textSecondary: string;
    textTertiary: string;
    textInverse: string;
    textOnPrimary: string;

    border: string;
    borderFocused: string;
    divider: string;

    success: string;
    successBg: string;
    warning: string;
    warningBg: string;
    error: string;
    errorBg: string;
    info: string;
    infoBg: string;

    disabled: string;
    disabledText: string;
    placeholder: string;
    backdrop: string;

    tabBar: string;
    tabBarInactive: string;
    tabBarActive: string;
    statusBar: string;

    player: {
      gradientStart: string;
      gradientEnd: string;
      karaokeHighlight: string;
      phoneticText: string;
      translationText: string;
      activeSentenceBg: string;
    };

    badge: {
      background: string;
      text: string;
    };
  };

  typography: {
    sizes: typeof fontSizes;
    weights: typeof fontWeights;
    lineHeights: typeof lineHeights;
  };

  spacing: typeof spacing;
  radii: typeof radii;

  gap: (v: number) => number;
}

// ─── Light Theme ────────────────────────────────────────────────
export const lightTheme: AppTheme = {
  colors: {
    primary: brand.primary,
    primaryLight: brand.primaryLight,
    primaryDark: brand.primaryDark,
    secondary: brand.secondary,
    secondaryLight: brand.secondaryLight,
    secondaryDark: brand.secondaryDark,

    background: palette.iceBlue,
    surface: palette.gray50,
    card: palette.white,
    elevated: palette.white,

    text: palette.gray900,
    textSecondary: palette.gray600,
    textTertiary: palette.gray400,
    textInverse: palette.white,
    textOnPrimary: palette.white,

    border: palette.gray200,
    borderFocused: brand.primary,
    divider: palette.gray100,

    success: palette.success,
    successBg: palette.successBg,
    warning: palette.warning,
    warningBg: palette.warningBg,
    error: palette.error,
    errorBg: palette.errorBg,
    info: palette.info,
    infoBg: palette.infoBg,

    disabled: palette.gray300,
    disabledText: palette.gray400,
    placeholder: palette.gray400,
    backdrop: "rgba(0, 0, 0, 0.5)",

    tabBar: palette.white,
    tabBarInactive: palette.gray400,
    tabBarActive: brand.primary,
    statusBar: palette.iceBlue,

    player: {
      gradientStart: palette.whiteBlue,
      gradientEnd: palette.gray50,
      karaokeHighlight: brand.primary,
      phoneticText: brand.primaryDark,
      translationText: brand.secondary,
      activeSentenceBg: player.activeSentenceBg, // works in light mode too due to alpha
    },

    badge: {
      background: palette.gray200,
      text: palette.gray900,
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
};
