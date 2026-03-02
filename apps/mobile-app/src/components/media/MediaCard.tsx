/**
 * MediaCard — Kapter
 *
 * Displays a single media item in the Library screen.
 */
import React from "react";
import { View, Text } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Ionicons } from "@expo/vector-icons";
import { Card, StatusBadge, IconButton } from "@/components";
import type { MediaItem } from "@/types/media";
import dayjs from "dayjs";

interface MediaCardProps {
  item: MediaItem;
  onPress: (item: MediaItem) => void;
  onOptionsPress?: (item: MediaItem) => void;
}

export function MediaCard({ item, onPress, onOptionsPress }: MediaCardProps) {
  const { theme } = useUnistyles();
  const formatDuration = (seconds?: number | null) => {
    if (!seconds) return "--:--";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const isYoutube = item.originType === "YOUTUBE";

  return (
    <Card onPress={() => onPress(item)} style={styles.card}>
      <View style={styles.row}>
        {/* Source Icon */}
        <View
          style={[
            styles.iconBox,
            isYoutube ? styles.youtubeIconBox : styles.localIconBox,
          ]}
        >
          <Ionicons
            name={isYoutube ? "logo-youtube" : "document-text"}
            size={24}
            color={isYoutube ? theme.colors.error : theme.colors.primary}
          />
        </View>

        {/* Info */}
        <View style={styles.infoContainer}>
          <Text style={styles.title} numberOfLines={1}>
            {item.title || "Untitled Media"}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>
              {formatDuration(item.durationSeconds)}
            </Text>
            <View style={styles.dot} />
            <Text style={styles.metaText}>
              {dayjs(item.createdAt).format("MMM D, YYYY")}
            </Text>
          </View>
          <View style={styles.statusRow}>
            <StatusBadge status={item.status} size="sm" />
            {item.status === "PROCESSING" &&
              typeof item.progress === "number" && (
                <Text style={styles.progressText}>{item.progress}%</Text>
              )}
          </View>
        </View>

        {/* Options */}
        {onOptionsPress && (
          <View style={styles.optionsContainer}>
            <IconButton
              name="ellipsis-vertical"
              size={20}
              color={theme.colors.textTertiary}
              onPress={() => onOptionsPress(item)}
            />
          </View>
        )}
      </View>

      {/* Progress Bar overlay for processing items */}
      {(item.status === "QUEUED" ||
        item.status === "VALIDATING" ||
        item.status === "PROCESSING") && (
        <View style={styles.progressBarBg}>
          <View
            style={[
              styles.progressBarFill,
              { width: `${Math.max(5, item.progress || 5)}%` },
            ]}
          />
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    marginBottom: theme.spacing[3],
    padding: theme.spacing[3],
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: theme.radii.lg,
    alignItems: "center",
    justifyContent: "center",
    marginRight: theme.spacing[3],
  },
  youtubeIconBox: {
    backgroundColor: theme.colors.errorBg,
  },
  localIconBox: {
    backgroundColor: theme.colors.primaryLight + "20", // 20% opacity wrapper
  },
  infoContainer: {
    flex: 1,
    justifyContent: "center",
  },
  title: {
    fontSize: theme.typography.sizes.base,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.text,
    marginBottom: 2,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  metaText: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.textTertiary,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: theme.colors.textTertiary,
    marginHorizontal: 6,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  progressText: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.primary,
    marginLeft: theme.spacing[2],
    fontWeight: theme.typography.weights.medium,
  },
  optionsContainer: {
    paddingLeft: theme.spacing[2],
  },
  progressBarBg: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: theme.colors.surface,
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: theme.colors.primary,
  },
}));
