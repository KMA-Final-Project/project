import React from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";

import type { MediaItem } from "@/types/media";
import type { PlaybackSource } from "@/hooks/usePlaybackSource";

interface SourceActionsProps {
  mediaItem: MediaItem;
  source: PlaybackSource;
  onOpenLayers: () => void;
  onOpenYoutube: () => void;
}

export function SourceActions({
  mediaItem,
  source,
  onOpenLayers,
  onOpenYoutube,
}: SourceActionsProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation("player");

  const statusText =
    source.sourceKind === "local"
      ? t("deviceOnly")
      : source.sourceKind === "cloud"
        ? t("cloudBacked")
        : source.reason === "missing-local-video"
          ? t("originalVideoUnavailable")
          : t("backupUnavailable");

  return (
    <View style={styles.container}>
      <View style={styles.infoRow}>
        <Ionicons
          name="cloud-outline"
          size={18}
          color={theme.colors.textSecondary}
        />
        <Text
          style={[styles.statusText, { color: theme.colors.textSecondary }]}
        >
          {statusText}
        </Text>
      </View>

      <View style={styles.utilityRow}>
        <Pressable onPress={onOpenLayers} style={styles.utilityButton}>
          <Ionicons name="layers" size={24} color={theme.colors.primary} />
          <Text style={[styles.utilityLabel, { color: theme.colors.primary }]}>
            {t("layers")}
          </Text>
        </Pressable>

        <View style={styles.utilityButton}>
          <Ionicons
            name={
              source.sourceKind === "local"
                ? "phone-portrait-outline"
                : "cloud-done-outline"
            }
            size={24}
            color={theme.colors.textSecondary}
          />
          <Text
            style={[styles.utilityLabel, { color: theme.colors.textSecondary }]}
          >
            {t("source")}
          </Text>
        </View>

        <Pressable
          onPress={onOpenYoutube}
          disabled={
            !(mediaItem.originType === "YOUTUBE" && mediaItem.originUrl)
          }
          style={styles.utilityButton}
        >
          <Ionicons
            name="open-outline"
            size={24}
            color={
              mediaItem.originType === "YOUTUBE" && mediaItem.originUrl
                ? theme.colors.textSecondary
                : theme.colors.disabledText
            }
          />
          <Text
            style={[
              styles.utilityLabel,
              {
                color:
                  mediaItem.originType === "YOUTUBE" && mediaItem.originUrl
                    ? theme.colors.textSecondary
                    : theme.colors.disabledText,
              },
            ]}
          >
            {t("openOnYoutube")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.spacing[2],
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  statusText: {
    flex: 1,
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
  },
  utilityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: theme.spacing[2],
  },
  utilityButton: {
    width: 72,
    alignItems: "center",
    gap: theme.spacing[1],
  },
  utilityLabel: {
    fontSize: theme.typography.sizes.xs,
    fontWeight: theme.typography.weights.semibold,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    textAlign: "center",
  },
}));
