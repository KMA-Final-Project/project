import React, { useState } from "react";
import { LayoutChangeEvent, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";

import { IconButton } from "@/components";

interface PlayerControlsProps {
  currentTimeSec: number;
  durationSec: number;
  isPlaying: boolean;
  loopSentence: boolean;
  playbackSpeed: number;
  disabled: boolean;
  onTogglePlayback: () => void;
  onSeek: (nextTimeSec: number) => void;
  onPrevious: () => void;
  onNext: () => void;
  onCycleSpeed: () => void;
  onToggleLoop: () => void;
}

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

export function PlayerControls({
  currentTimeSec,
  durationSec,
  isPlaying,
  loopSentence,
  playbackSpeed,
  disabled,
  onTogglePlayback,
  onSeek,
  onPrevious,
  onNext,
  onCycleSpeed,
  onToggleLoop,
}: PlayerControlsProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation("player");
  const [trackWidth, setTrackWidth] = useState(0);

  const progress =
    durationSec > 0 ? Math.min(currentTimeSec / durationSec, 1) : 0;

  const handleSeekPress = (event: LayoutChangeEvent | any) => {
    if (disabled || durationSec <= 0 || trackWidth <= 0) {
      return;
    }

    const nextProgress = Math.max(
      0,
      Math.min(event.nativeEvent.locationX / trackWidth, 1),
    );
    onSeek(nextProgress * durationSec);
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.card }]}>
      <View style={styles.timeRow}>
        <Text style={[styles.timeLabel, { color: theme.colors.textSecondary }]}>
          {formatTime(currentTimeSec)}
        </Text>
        <Text style={[styles.timeLabel, { color: theme.colors.textSecondary }]}>
          {formatTime(durationSec)}
        </Text>
      </View>

      <Pressable
        disabled={disabled}
        onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
        onPress={handleSeekPress}
        style={styles.progressTrack}
      >
        <View
          style={[
            styles.progressBar,
            { backgroundColor: theme.colors.surface },
          ]}
        >
          <View
            style={[
              styles.progressFill,
              {
                width: `${progress * 100}%`,
                backgroundColor: theme.colors.primary,
              },
            ]}
          />
          <View
            style={[
              styles.thumb,
              {
                backgroundColor: theme.colors.primary,
                left: `${progress * 100}%`,
              },
            ]}
          />
        </View>
      </Pressable>

      <View style={styles.controlsRow}>
        <Pressable onPress={onCycleSpeed} style={styles.sideAction}>
          <Ionicons
            name="speedometer-outline"
            size={24}
            color={theme.colors.textSecondary}
          />
          <Text
            style={[styles.sideValue, { color: theme.colors.textSecondary }]}
          >
            {playbackSpeed.toFixed(2).replace(/\.00$/, "") + "x"}
          </Text>
        </Pressable>

        <View style={styles.transportGroup}>
          <IconButton
            name="play-skip-back"
            size={34}
            onPress={onPrevious}
            disabled={disabled}
            accessibilityLabel={t("previous")}
            color={theme.colors.textOnPrimary}
          />
          <Pressable
            onPress={onTogglePlayback}
            disabled={disabled}
            style={[
              styles.playButton,
              {
                backgroundColor: disabled
                  ? theme.colors.disabled
                  : theme.colors.primary,
              },
            ]}
          >
            <Ionicons
              name={isPlaying ? "pause" : "play"}
              size={34}
              color={theme.colors.textOnPrimary}
            />
          </Pressable>

          <IconButton
            name="play-skip-forward"
            size={34}
            onPress={onNext}
            disabled={disabled}
            accessibilityLabel={t("next")}
            color={theme.colors.textOnPrimary}
          />
        </View>

        <Pressable onPress={onToggleLoop} style={styles.sideAction}>
          <Ionicons
            name="repeat"
            size={24}
            color={
              loopSentence ? theme.colors.primary : theme.colors.textSecondary
            }
          />
          <Text
            style={[
              styles.sideValue,
              {
                color: loopSentence
                  ? theme.colors.primary
                  : theme.colors.textSecondary,
              },
            ]}
          >
            {t("loop")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    borderTopLeftRadius: theme.radii["2xl"],
    borderTopRightRadius: theme.radii["2xl"],
    paddingHorizontal: theme.spacing[5],
    paddingTop: theme.spacing[4],
    paddingBottom: theme.spacing[3],
    gap: theme.spacing[3],
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  timeLabel: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
  },
  progressTrack: {
    paddingVertical: theme.spacing[2],
  },
  progressBar: {
    height: 8,
    borderRadius: theme.radii.full,
    overflow: "visible",
    justifyContent: "center",
  },
  progressFill: {
    height: 8,
    borderRadius: theme.radii.full,
  },
  thumb: {
    position: "absolute",
    top: -4,
    marginLeft: -8,
    width: 16,
    height: 16,
    borderRadius: theme.radii.full,
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  transportGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[5],
  },
  sideAction: {
    width: 64,
    alignItems: "center",
    gap: theme.spacing[1],
  },
  playButton: {
    width: 84,
    height: 84,
    borderRadius: theme.radii.full,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 10,
  },
  sideValue: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.semibold,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
}));
