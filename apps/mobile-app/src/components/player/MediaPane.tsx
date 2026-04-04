import React from "react";
import { Image, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { VideoView, type VideoPlayer } from "expo-video";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import type { MediaOriginType } from "@/types/media";
import type { PlaybackSource } from "@/hooks/usePlaybackSource";

interface MediaPaneProps {
  title: string;
  thumbnailUrl?: string | null;
  originType: MediaOriginType;
  source: PlaybackSource;
  videoPlayer: VideoPlayer | null;
}

export function MediaPane({
  title,
  thumbnailUrl,
  originType,
  source,
  videoPlayer,
}: MediaPaneProps) {
  const { theme } = useUnistyles();

  if (source.kind === "video" && videoPlayer) {
    return (
      <View style={styles.container}>
        <VideoView
          player={videoPlayer}
          nativeControls={false}
          contentFit="cover"
          surfaceType="textureView"
          style={styles.video}
        />
      </View>
    );
  }

  const sourceLabel =
    source.sourceKind === "local"
      ? "DEVICE"
      : source.sourceKind === "cloud"
        ? "STREAM"
        : "SUBTITLES";

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[
          theme.colors.player.gradientStart,
          theme.colors.player.gradientEnd,
        ]}
        style={styles.audioPane}
      >
        <View style={styles.badgeRow}>
          <View
            style={[
              styles.badge,
              {
                backgroundColor: theme.colors.card,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Text style={[styles.badgeText, { color: theme.colors.text }]}>
              {sourceLabel}
            </Text>
          </View>
          <View
            style={[
              styles.badge,
              {
                backgroundColor: theme.colors.card,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Text style={[styles.badgeText, { color: theme.colors.text }]}>
              {originType}
            </Text>
          </View>
        </View>

        <View style={styles.heroContent}>
          {thumbnailUrl ? (
            <Image source={{ uri: thumbnailUrl }} style={styles.artwork} />
          ) : (
            <View
              style={[
                styles.artwork,
                styles.artworkFallback,
                { backgroundColor: theme.colors.surface },
              ]}
            >
              <Ionicons
                name={
                  originType === "YOUTUBE" ? "logo-youtube" : "musical-notes"
                }
                size={42}
                color={theme.colors.textSecondary}
              />
            </View>
          )}

          <Text
            style={[styles.title, { color: theme.colors.text }]}
            numberOfLines={2}
          >
            {title}
          </Text>
          <Text
            style={[styles.caption, { color: theme.colors.textSecondary }]}
            numberOfLines={2}
          >
            {source.reason === "missing-local-video"
              ? "Original video unavailable on this device"
              : source.kind === "none"
                ? "Subtitle-only mode"
                : source.kind === "audio"
                  ? "Audio playback"
                  : "Video playback"}
          </Text>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    height: 248,
    borderRadius: theme.radii["2xl"],
    overflow: "hidden",
    backgroundColor: theme.colors.surface,
  },
  video: {
    width: "100%",
    height: "100%",
  },
  audioPane: {
    flex: 1,
    padding: theme.spacing[5],
    justifyContent: "space-between",
  },
  badgeRow: {
    flexDirection: "row",
    gap: theme.spacing[2],
  },
  badge: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.radii.full,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: theme.typography.sizes.xs,
    fontWeight: theme.typography.weights.bold,
    letterSpacing: 0.6,
  },
  heroContent: {
    alignItems: "center",
    gap: theme.spacing[3],
  },
  artwork: {
    width: 88,
    height: 88,
    borderRadius: theme.radii.xl,
  },
  artworkFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: theme.typography.sizes.xl,
    fontWeight: theme.typography.weights.bold,
    textAlign: "center",
  },
  caption: {
    fontSize: theme.typography.sizes.sm,
    textAlign: "center",
    opacity: 0.8,
  },
}));
