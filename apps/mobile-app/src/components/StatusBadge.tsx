/**
 * StatusBadge — Kapter
 *
 * Colored pill badge for MediaItem status values.
 *
 * IMPORTANT: useUnistyles() must be called so this component
 * re-renders when the theme changes at runtime.
 */
import React from "react";
import { View, Text } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import type { MediaStatus } from "@/types/media";
import { useTranslation } from "react-i18next";

interface StatusBadgeProps {
  status: MediaStatus;
  size?: "sm" | "md";
}

export function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  // ← Critical: subscribe to theme changes so the badge re-renders on switch
  useUnistyles();
  const { t } = useTranslation();

  const STATUS_LABELS: Record<MediaStatus, string> = {
    QUEUED: t("processing.status.queued"),
    VALIDATING: t("processing.status.validating"),
    PROCESSING: t("processing.status.processing"),
    COMPLETED: t("processing.status.completed"),
    FAILED: t("processing.status.failed"),
  };

  return (
    <View
      style={[
        styles.badge,
        styles[`badge_${status}`],
        size === "sm" && styles.badgeSm,
      ]}
    >
      <Text
        style={[
          styles.label,
          styles[`label_${status}`],
          size === "sm" && styles.labelSm,
        ]}
      >
        {STATUS_LABELS[status]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  // ── Base badge ──────────────────────────────────────────────────
  badge: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.radii.full,
    alignSelf: "flex-start",
  },
  badgeSm: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 4,
  },

  // ── Per-status backgrounds ──────────────────────────────────────
  badge_QUEUED: {
    backgroundColor: theme.colors.warningBg,
  },
  badge_VALIDATING: {
    backgroundColor: theme.colors.infoBg,
  },
  badge_PROCESSING: {
    backgroundColor: theme.colors.infoBg,
  },
  badge_COMPLETED: {
    backgroundColor: theme.colors.successBg,
  },
  badge_FAILED: {
    backgroundColor: theme.colors.errorBg,
  },

  // ── Label base ──────────────────────────────────────────────────
  label: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.semibold,
    letterSpacing: 0.2,
  },
  labelSm: {
    fontSize: theme.typography.sizes.xs,
  },

  // ── Per-status label colors ─────────────────────────────────────
  label_QUEUED: {
    color: theme.colors.warning,
  },
  label_VALIDATING: {
    color: theme.colors.info,
  },
  label_PROCESSING: {
    color: theme.colors.info,
  },
  label_COMPLETED: {
    color: theme.colors.success,
  },
  label_FAILED: {
    color: theme.colors.error,
  },
}));
