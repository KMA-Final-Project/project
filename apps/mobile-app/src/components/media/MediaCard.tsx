/**
 * MediaCard — Kapter
 *
 * Displays a single media item matching the Stitch design:
 *   - Large left thumbnail (rounded rectangle)
 *   - Right column:
 *      * Top row: Status Badge (left), 3 dots menu (right)
 *      * Title
 *      * Details / Progress info
 */
import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Card, IconButton, StatusBadge } from "@/components";
import type { MediaItem } from "@/types/media";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

interface MediaCardProps {
  item: MediaItem;
  onPress: (item: MediaItem) => void;
  onOptionsPress?: (item: MediaItem) => void;
}

function formatDuration(seconds?: number | null) {
  if (!seconds) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function MediaCard({ item, onPress, onOptionsPress }: MediaCardProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation("common");
  const isPlayerReady = (item.artifacts?.translatedBatchCount ?? 0) > 0;

  // Build subtitle text
  const subtitleLine = (() => {
    if (item.status === "COMPLETED") {
      const parts = [formatDuration(item.durationSeconds)];
      if (item.languageCount && item.languageCount > 1) {
        parts.push(`${item.languageCount} languages`);
      }
      return parts.join(" • ");
    }
    if (item.status === "QUEUED") {
      const ago = dayjs(item.createdAt).fromNow();
      return `Added ${ago}`;
    }
    if (item.status === "FAILED") {
      return item.failReason || "File too large (Max 500MB)";
    }
    return formatDuration(item.durationSeconds);
  })();

  const thumbnailUrl = item.thumbnailUrl;
  const isYoutube = item.originType === "YOUTUBE";
  const isProcessing =
    item.status === "PROCESSING" || item.status === "VALIDATING";

  return (
    <Card onPress={() => onPress(item)} style={styles.card}>
      <View style={styles.row}>
        {/* Left: Thumbnail shape */}
        <View style={styles.thumbnailWrapper}>
          {thumbnailUrl ? (
            <Image
              source={{ uri: thumbnailUrl }}
              style={styles.thumbnail}
              resizeMode="cover"
            />
          ) : (
            // Placeholder based on type
            <View
              style={[
                styles.thumbnail,
                styles.thumbnailPlaceholder,
                { backgroundColor: theme.colors.surface },
              ]}
            >
              {isProcessing ? (
                <View style={styles.processingSpinnerPlaceholder} />
              ) : isYoutube ? (
                <Ionicons name="play" size={28} color="#fff" />
              ) : (
                <Ionicons
                  name="musical-notes"
                  size={28}
                  color={theme.colors.primary}
                />
              )}
            </View>
          )}

          {/* YT Logo absolute overlay if it's Youtube placeholder */}
          {isYoutube && !thumbnailUrl && !isProcessing && (
            <View style={styles.youtubeLabel}>
              <Text style={styles.youtubeText}>YouTube</Text>
            </View>
          )}

          {isPlayerReady && (
            <View
              style={[
                styles.readyBadge,
                { backgroundColor: theme.colors.primary },
              ]}
            >
              <Ionicons
                name="play"
                size={10}
                color={theme.colors.textOnPrimary}
              />
              <Text
                style={[
                  styles.readyBadgeText,
                  { color: theme.colors.textOnPrimary },
                ]}
              >
                {t("library.playerReady")}
              </Text>
            </View>
          )}
        </View>

        {/* Right: Info Column */}
        <View style={styles.infoCol}>
          {/* Top Row: Badge + More actions */}
          <View style={styles.infoTopRow}>
            <StatusBadge status={item.status} size="sm" />
            <View style={styles.moreAction}>
              <IconButton
                name="ellipsis-vertical"
                size={20}
                color={theme.colors.textTertiary}
                onPress={() => onOptionsPress?.(item)}
                hitSlop={8}
              />
            </View>
          </View>

          {/* Title */}
          <Text
            style={[styles.title, { color: theme.colors.text }]}
            numberOfLines={1}
          >
            {item.title || "Untitled"}
          </Text>

          {/* Subtitle / Progress */}
          {isProcessing ? (
            <View style={styles.progressContainer}>
              <Text style={[styles.progressText, { color: theme.colors.info }]}>
                {t("library.generating")}{" "}
                {Math.round((item.progress ?? 0) * 100)}%
              </Text>
              <View
                style={[
                  styles.progressBg,
                  { backgroundColor: theme.colors.surface },
                ]}
              >
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.max(4, Math.round((item.progress ?? 0) * 100))}%`,
                      backgroundColor: theme.colors.info,
                    },
                  ]}
                />
              </View>
            </View>
          ) : (
            <Text
              style={[
                styles.subtitle,
                {
                  color:
                    item.status === "FAILED"
                      ? theme.colors.error
                      : theme.colors.textSecondary,
                },
              ]}
              numberOfLines={1}
            >
              {subtitleLine}
            </Text>
          )}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
    paddingHorizontal: 0,
    paddingVertical: 0,
    overflow: "hidden",
    borderRadius: 16,
  },
  row: {
    flexDirection: "row",
    padding: 16,
    gap: 16,
  },

  // ── Thumbnail ──────────────────────────────────────────────────
  thumbnailWrapper: {
    width: 88,
    height: 88,
    borderRadius: 14,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "#D3BBAE", // A fallback nice tone
  },
  thumbnail: {
    width: 88,
    height: 88,
  },
  thumbnailPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  processingSpinnerPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.4)",
    borderTopColor: "#fff",
  },
  youtubeLabel: {
    position: "absolute",
    bottom: 4,
    right: 4,
    backgroundColor: "#fff",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  youtubeText: {
    color: "#E24F4F",
    fontSize: 9,
    fontWeight: "bold",
  },
  readyBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  readyBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },

  // ── Info Column ────────────────────────────────────────────────
  infoCol: {
    flex: 1,
    paddingVertical: 2, // Slight indent to optically center with icon
  },
  infoTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  moreAction: {
    marginRight: -8, // pull to edges of card
    marginTop: -4,
  },
  title: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 4,
    letterSpacing: 0.1,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "500",
  },

  // ── Progress ───────────────────────────────────────────────────
  progressContainer: {
    marginTop: 2,
  },
  progressText: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
  },
  progressBg: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
});
