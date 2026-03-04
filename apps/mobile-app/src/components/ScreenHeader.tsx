/**
 * ScreenHeader — Kapter
 *
 * Adaptive top navigation bar:
 * - Library home: large left-aligned title + optional right avatar/action
 * - Detail screens: back button (left) + centered title + optional right action
 *
 * Automatically accounts for safe-area top inset.
 */
import React from "react";
import { View, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { IconButton } from "./IconButton";

interface ScreenHeaderProps {
  title: string;
  /** When set, shows a back button and centers the title */
  onBack?: () => void;
  /** Slot for icons, avatars, or action buttons on the right */
  rightActions?: React.ReactNode;
  /** When true, title is large & left-aligned (home screen style). Default false */
  large?: boolean;
}

export function ScreenHeader({
  title,
  onBack,
  rightActions,
  large = false,
}: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();

  if (large) {
    // Home-screen style: big left-aligned title, avatar slot on the right
    return (
      <View style={[styles.containerLarge, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.titleLarge} numberOfLines={1}>
          {title}
        </Text>
        {rightActions && <View style={styles.rightSlot}>{rightActions}</View>}
      </View>
    );
  }

  // Detail-screen style: back button + centered title + right action
  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.side}>
        {onBack && (
          <IconButton
            name="arrow-back"
            size={24}
            onPress={onBack}
            hitSlop={12}
          />
        )}
      </View>

      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>

      <View style={[styles.side, styles.sideRight]}>
        {rightActions ?? null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  // ── Detail header ───────────────────────────────────────────────
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing[4],
    paddingBottom: theme.spacing[3],
    backgroundColor: theme.colors.background,
  },
  side: {
    width: 48,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  sideRight: {
    alignItems: "flex-end",
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: theme.typography.sizes.xl,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
  },

  // ── Home / Large header ─────────────────────────────────────────
  containerLarge: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: theme.spacing[5],
    paddingBottom: theme.spacing[3],
    backgroundColor: theme.colors.background,
  },
  titleLarge: {
    flex: 1,
    fontSize: 32,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
    letterSpacing: -0.5,
  },
  rightSlot: {
    marginBottom: 2,
  },
}));
