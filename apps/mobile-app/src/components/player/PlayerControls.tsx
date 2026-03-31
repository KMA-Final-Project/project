import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { IconButton } from "@/components";

const AnimatedView = Animated.createAnimatedComponent(View);

interface PlayerControlsProps {
  currentTimeSec: number;
  durationSec: number;
  isPlaying: boolean;
  isCoveragePending: boolean;
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
  isCoveragePending,
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
  const [scrubbingTimeSec, setScrubbingTimeSec] = useState<number | null>(null);
  const thumbScale = useSharedValue(1);
  const trackScaleY = useSharedValue(1);

  const displayedTimeSec = scrubbingTimeSec ?? currentTimeSec;
  const progress =
    durationSec > 0 ? Math.min(displayedTimeSec / durationSec, 1) : 0;
  const canSeek = !disabled && durationSec > 0 && trackWidth > 0;

  const resolveSeekTime = useCallback(
    (positionX: number) => {
      if (!canSeek) {
        return currentTimeSec;
      }

      const nextProgress = Math.max(0, Math.min(positionX / trackWidth, 1));
      return nextProgress * durationSec;
    },
    [canSeek, currentTimeSec, durationSec, trackWidth],
  );

  const showActiveScrubber = useCallback(() => {
    thumbScale.value = withTiming(1.45, { duration: 120 });
    trackScaleY.value = withTiming(1.2, { duration: 120 });
  }, [thumbScale, trackScaleY]);

  const hideActiveScrubber = useCallback(() => {
    thumbScale.value = withTiming(1, { duration: 180 });
    trackScaleY.value = withTiming(1, { duration: 180 });
  }, [thumbScale, trackScaleY]);

  const previewSeek = useCallback(
    (positionX: number) => {
      if (!canSeek) {
        return;
      }

      setScrubbingTimeSec(resolveSeekTime(positionX));
    },
    [canSeek, resolveSeekTime],
  );

  const commitSeek = useCallback(
    (positionX: number) => {
      if (!canSeek) {
        return;
      }

      onSeek(resolveSeekTime(positionX));
      setScrubbingTimeSec(null);
    },
    [canSeek, onSeek, resolveSeekTime],
  );

  const cancelPreview = useCallback(() => {
    setScrubbingTimeSec(null);
  }, []);

  const triggerScrubStartHaptic = useCallback(() => {
    void Haptics.selectionAsync();
  }, []);

  const triggerSeekCommitHaptic = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const tapGesture = useMemo(
    () =>
      Gesture.Tap()
        .enabled(canSeek)
        .runOnJS(true)
        .onEnd((event) => {
          commitSeek(event.x);
          triggerSeekCommitHaptic();
        }),
    [canSeek, commitSeek, triggerSeekCommitHaptic],
  );

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(canSeek)
        .runOnJS(true)
        .maxPointers(1)
        .activeOffsetX([-4, 4])
        .onBegin(() => {
          showActiveScrubber();
          triggerScrubStartHaptic();
        })
        .onStart((event) => {
          previewSeek(event.x);
        })
        .onUpdate((event) => {
          previewSeek(event.x);
        })
        .onEnd((event) => {
          commitSeek(event.x);
          triggerSeekCommitHaptic();
        })
        .onFinalize(() => {
          hideActiveScrubber();
          cancelPreview();
        }),
    [
      canSeek,
      cancelPreview,
      commitSeek,
      hideActiveScrubber,
      previewSeek,
      showActiveScrubber,
      triggerScrubStartHaptic,
      triggerSeekCommitHaptic,
    ],
  );

  const scrubberGesture = useMemo(
    () => Gesture.Exclusive(panGesture, tapGesture),
    [panGesture, tapGesture],
  );

  const progressBarAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: trackScaleY.value }],
  }));

  const thumbAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: thumbScale.value }],
  }));

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.card }]}>
      <View style={styles.timeRow}>
        <Text style={[styles.timeLabel, { color: theme.colors.textSecondary }]}>
          {formatTime(displayedTimeSec)}
        </Text>
        <Text style={[styles.timeLabel, { color: theme.colors.textSecondary }]}>
          {formatTime(durationSec)}
        </Text>
      </View>

      <GestureDetector gesture={scrubberGesture}>
        <AnimatedView
          onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
          style={[
            styles.progressTrack,
            disabled && styles.progressTrackDisabled,
          ]}
          accessible
          accessibilityRole="adjustable"
          accessibilityState={{ disabled }}
          accessibilityLabel={t("seek")}
        >
          <AnimatedView
            style={[
              styles.progressBar,
              {
                backgroundColor: theme.colors.surface,
              },
              progressBarAnimatedStyle,
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
            <AnimatedView
              style={[
                styles.thumb,
                {
                  backgroundColor: theme.colors.primary,
                  left: `${progress * 100}%`,
                },
                thumbAnimatedStyle,
              ]}
            />
          </AnimatedView>
        </AnimatedView>
      </GestureDetector>

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
            color={theme.colors.text}
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
            {isCoveragePending ? (
              <ActivityIndicator
                size="small"
                color={theme.colors.textOnPrimary}
              />
            ) : (
              <Ionicons
                name={isPlaying ? "pause" : "play"}
                size={34}
                color={theme.colors.textOnPrimary}
              />
            )}
          </Pressable>

          <IconButton
            name="play-skip-forward"
            size={34}
            onPress={onNext}
            disabled={disabled}
            accessibilityLabel={t("next")}
            color={theme.colors.text}
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
  progressTrackDisabled: {
    opacity: 0.55,
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
    width: 72,
    height: 72,
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
