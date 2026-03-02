/**
 * ScreenHeader — Kapter
 *
 * Reusable top navigation bar with optional back button,
 * title, and right-side action slot.
 *
 * Automatically accounts for safe-area top inset so content
 * is never hidden behind the device status bar.
 */
import React from "react";
import { View, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { IconButton } from "./IconButton";

interface ScreenHeaderProps {
  title: string;
  onBack?: () => void;
  rightActions?: React.ReactNode;
}

export function ScreenHeader({
  title,
  onBack,
  rightActions,
}: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      {/* Left: back button or placeholder */}
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

      {/* Center: title */}
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>

      {/* Right: actions or placeholder */}
      <View style={[styles.side, styles.sideRight]}>
        {rightActions ?? null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
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
}));
