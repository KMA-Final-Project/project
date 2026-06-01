/**
 * MediaCard — Kapter
 *
 * Redesigned as a modern, content-first cinematic card.
 *   - 16:9 aspect ratio cover area at the top
 *   - Programmatic gradient + native-animated waveform fallback for pure audio
 *   - Overlays: Status Badge (top-left), Source Badge (top-right), Duration (bottom-right), Player Ready (bottom-left)
 *   - Metadata flows naturally underneath the cover with plenty of whitespace
 */
import React from "react";
import { View, Text, Image, StyleSheet, Animated, Easing } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { LinearGradient } from "expo-linear-gradient";
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

/**
 * Native-animated vertical bars simulating a playing audio waveform
 */
function WaveformAnimation({ active = true }: { active?: boolean }) {
  const { theme } = useUnistyles();
  const anim1 = React.useRef(new Animated.Value(1)).current;
  const anim2 = React.useRef(new Animated.Value(1)).current;
  const anim3 = React.useRef(new Animated.Value(1)).current;
  const anim4 = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    if (!active) return;
    const animateBar = (anim: Animated.Value, duration: number, toValue: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue,
            duration,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 1,
            duration,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
    };

    const a1 = animateBar(anim1, 500, 2.8);
    const a2 = animateBar(anim2, 750, 3.8);
    const a3 = animateBar(anim3, 600, 2.2);
    const a4 = animateBar(anim4, 800, 3.2);

    Animated.parallel([a1, a2, a3, a4]).start();

    return () => {
      anim1.stopAnimation();
      anim2.stopAnimation();
      anim3.stopAnimation();
      anim4.stopAnimation();
    };
  }, [active, anim1, anim2, anim3, anim4]);

  const barStyle = (anim: Animated.Value) => ({
    width: 4,
    height: 12,
    borderRadius: 2,
    backgroundColor: theme.colors.textInverse,
    transform: [{ scaleY: anim }],
    marginHorizontal: 3,
  });

  return (
    <View style={styles.waveformContainer}>
      <Animated.View style={barStyle(anim1)} />
      <Animated.View style={barStyle(anim2)} />
      <Animated.View style={barStyle(anim3)} />
      <Animated.View style={barStyle(anim4)} />
    </View>
  );
}

export function MediaCard({ item, onPress, onOptionsPress }: MediaCardProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation("common");
  const isPlayerReady = (item.artifacts?.translatedBatchCount ?? 0) > 0;

  // Build subtitle text
  const subtitleLine = (() => {
    if (item.status === "COMPLETED") {
      const parts = [];
      if (item.languageCount && item.languageCount > 1) {
        parts.push(`${item.languageCount} languages`);
      } else {
        parts.push(t("library.subtitlesGenerated", "Subtitles generated"));
      }
      parts.push(dayjs(item.createdAt).fromNow());
      return parts.join(" • ");
    }
    if (item.status === "QUEUED") {
      const ago = dayjs(item.createdAt).fromNow();
      return `Added ${ago}`;
    }
    if (item.status === "FAILED") {
      return item.failReason || "Failed to process media file";
    }
    return dayjs(item.createdAt).fromNow();
  })();

  const thumbnailUrl = item.thumbnailUrl;
  const isYoutube = item.originType === "YOUTUBE";
  const isProcessing =
    item.status === "PROCESSING" || item.status === "VALIDATING";

  return (
    <Card onPress={() => onPress(item)} style={styles.card}>
      {/* 16:9 Cover Image Area */}
      <View style={styles.coverWrapper}>
        {thumbnailUrl ? (
          <Image
            source={{ uri: thumbnailUrl }}
            style={styles.coverImage}
            resizeMode="cover"
          />
        ) : (
          // Programmatic fallback for pure audio or YouTube placeholder
          <LinearGradient
            colors={
              isYoutube
                ? ["#1e1b4b", "#0f172a"] // Dark YouTube-like gradient
                : [theme.colors.primary, theme.colors.secondary || "#8B5CF6"] // Vibrant theme gradient
            }
            style={styles.fallbackCover}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            {isProcessing ? (
              <View style={styles.spinner} />
            ) : isYoutube ? (
              <Ionicons name="play-circle-outline" size={48} color="#fff" />
            ) : (
              <WaveformAnimation active={true} />
            )}
          </LinearGradient>
        )}

        {/* TOP-LEFT OVERLAY: Status Badge */}
        <View style={styles.statusOverlay}>
          <StatusBadge status={item.status} size="sm" />
        </View>

        {/* TOP-RIGHT OVERLAY: Source Type Badge */}
        <View style={[styles.sourceBadge, isYoutube ? styles.sourceYoutube : styles.sourceLocal]}>
          <Ionicons
            name={isYoutube ? "logo-youtube" : "document-text"}
            size={12}
            color={isYoutube ? "#EF4444" : theme.colors.primary}
          />
          <Text style={[styles.sourceText, { color: isYoutube ? "#EF4444" : theme.colors.primary }]}>
            {isYoutube ? "YouTube" : "Local"}
          </Text>
        </View>

        {/* BOTTOM-LEFT OVERLAY: Player Ready Badge */}
        {isPlayerReady && (
          <View style={[styles.readyBadge, { backgroundColor: theme.colors.primary }]}>
            <Ionicons name="play" size={10} color={theme.colors.textOnPrimary} />
            <Text style={[styles.readyBadgeText, { color: theme.colors.textOnPrimary }]}>
              {t("library.playerReady", "Ready")}
            </Text>
          </View>
        )}

        {/* BOTTOM-RIGHT OVERLAY: Duration Overlay */}
        {item.durationSeconds && item.durationSeconds > 0 ? (
          <View style={styles.durationOverlay}>
            <Text style={styles.durationText}>
              {formatDuration(item.durationSeconds)}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Info Content Area */}
      <View style={styles.infoContainer}>
        <View style={styles.metaRow}>
          <View style={styles.textCol}>
            {/* Title */}
            <Text
              style={[styles.title, { color: theme.colors.text }]}
              numberOfLines={2}
            >
              {item.title || "Untitled Media"}
            </Text>

            {/* Subtitle / Processing Progress */}
            {isProcessing ? (
              <View style={styles.progressContainer}>
                <View style={styles.progressHeader}>
                  <Text style={[styles.progressText, { color: theme.colors.info }]}>
                    {t("library.generating")}{" "}
                    {Math.round((item.progress ?? 0) * 100)}%
                  </Text>
                  {item.currentStep && (
                    <Text style={[styles.stepText, { color: theme.colors.textTertiary }]}>
                      {item.currentStep}
                    </Text>
                  )}
                </View>
                <View style={[styles.progressBg, { backgroundColor: theme.colors.border }]}>
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

          {/* Action Menu (3 Dots) */}
          <View style={styles.actionCol}>
            <IconButton
              name="ellipsis-vertical"
              size={20}
              color={theme.colors.textTertiary}
              onPress={() => onOptionsPress?.(item)}
              hitSlop={12}
            />
          </View>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 20,
    paddingHorizontal: 0,
    paddingVertical: 0,
    overflow: "hidden",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.05)",
  },
  coverWrapper: {
    width: "100%",
    aspectRatio: 16 / 9,
    position: "relative",
    backgroundColor: "#1e293b",
  },
  coverImage: {
    width: "100%",
    height: "100%",
  },
  fallbackCover: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  spinner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.3)",
    borderTopColor: "#fff",
  },
  waveformContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 60,
  },
  statusOverlay: {
    position: "absolute",
    top: 12,
    left: 12,
    zIndex: 1,
  },
  sourceBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 99,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  sourceYoutube: {
    backgroundColor: "#FEF2F2",
  },
  sourceLocal: {
    backgroundColor: "#EFF6FF",
  },
  sourceText: {
    fontSize: 11,
    fontWeight: "700",
  },
  readyBadge: {
    position: "absolute",
    bottom: 12,
    left: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 99,
  },
  readyBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  durationOverlay: {
    position: "absolute",
    bottom: 12,
    right: 12,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  durationText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700",
  },
  infoContainer: {
    padding: 16,
    backgroundColor: "transparent",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  textCol: {
    flex: 1,
    paddingRight: 12,
  },
  actionCol: {
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 24,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "500",
  },
  progressContainer: {
    marginTop: 4,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  progressText: {
    fontSize: 13,
    fontWeight: "700",
  },
  stepText: {
    fontSize: 11,
    fontWeight: "600",
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
