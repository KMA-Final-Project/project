/**
 * StatusBadge — Kapter
 *
 * Colored pill badge for MediaItem status values.
 *
 * We use useUnistyles() to get theme directly and apply colors as
 * inline styles — this is the correct pattern for dynamic per-status
 * colors so the component actually re-renders on theme switch.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import type { MediaStatus } from "@/types/media";
import { useTranslation } from "react-i18next";

interface StatusBadgeProps {
  status: MediaStatus;
  size?: "sm" | "md";
}

export function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const { theme } = useUnistyles(); // ← subscribe AND get live theme values
  const { t } = useTranslation("processing");

  const STATUS_LABELS: Record<MediaStatus, string> = {
    QUEUED: t("status.queued"),
    VALIDATING: t("status.validating"),
    PROCESSING: t("status.processing"),
    COMPLETED: t("status.completed"),
    FAILED: t("status.failed"),
  };

  // Map each status to live theme colors (read at render time → re-renders with theme)
  const colorMap: Record<MediaStatus, { bg: string; fg: string }> = {
    QUEUED: { bg: theme.colors.warningBg, fg: theme.colors.warning },
    VALIDATING: { bg: theme.colors.infoBg, fg: theme.colors.info },
    PROCESSING: { bg: theme.colors.infoBg, fg: theme.colors.info },
    COMPLETED: { bg: theme.colors.successBg, fg: theme.colors.success },
    FAILED: { bg: theme.colors.errorBg, fg: theme.colors.error },
  };

  const { bg, fg } = colorMap[status];
  const isSmall = size === "sm";

  return (
    <View
      style={[
        styles.badge,
        isSmall ? styles.badgeSm : styles.badgeMd,
        { backgroundColor: bg },
      ]}
    >
      <Text
        style={[
          styles.label,
          isSmall ? styles.labelSm : styles.labelMd,
          { color: fg },
        ]}
      >
        {STATUS_LABELS[status]}
      </Text>
    </View>
  );
}

// Only layout/dimension styles here — colors are inlined above
const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    borderRadius: 999,
  },
  badgeMd: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeSm: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  label: {
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  labelMd: {
    fontSize: 13,
  },
  labelSm: {
    fontSize: 11,
  },
});
