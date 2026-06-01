import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  Text,
  TouchableWithoutFeedback,
  View,
} from "react-native";
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


const AnimatedView = Animated.createAnimatedComponent(View);

interface PlayerControlsProps {
  currentTimeSec: number;
  durationSec: number;
  isPlaying: boolean;
  isCoveragePending: boolean;
  loopSentence: boolean;
  playbackSpeed: number;
  disabled: boolean;
  isPinned: boolean;
  onTogglePlayback: () => void;
  onSeek: (nextTimeSec: number) => void;
  onPrevious: () => void;
  onNext: () => void;
  onChangeSpeed: (speed: number) => void;
  onToggleLoop: () => void;
  onTogglePin: () => void;
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
  isPinned,
  onTogglePlayback,
  onSeek,
  onPrevious,
  onNext,
  onChangeSpeed,
  onToggleLoop,
  onTogglePin,
}: PlayerControlsProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation("player");
  const [trackWidth, setTrackWidth] = useState(0);
  const [speedDropdownVisible, setSpeedDropdownVisible] = useState(false);
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
        <Pressable onPress={onTogglePin} style={styles.controlButton}>
          <Ionicons
            name={isPinned ? "pin" : "pin-outline"}
            size={22}
            color={isPinned ? theme.colors.primary : theme.colors.textSecondary}
          />
          <Text
            style={[
              styles.controlLabel,
              { color: isPinned ? theme.colors.primary : theme.colors.textSecondary },
            ]}
          >
            {t("pin")}
          </Text>
        </Pressable>

        <Pressable onPress={() => {}} style={styles.controlButton}>
          <Ionicons
            name="sparkles-outline"
            size={22}
            color={theme.colors.textSecondary}
          />
          <Text style={[styles.controlLabel, { color: theme.colors.textSecondary }]}>
            {t("explain")}
          </Text>
        </Pressable>

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
              size={28}
              color={theme.colors.textOnPrimary}
            />
          )}
        </Pressable>

        <Pressable onPress={onToggleLoop} style={styles.controlButton}>
          <Ionicons
            name="repeat"
            size={22}
            color={
              loopSentence ? theme.colors.primary : theme.colors.textSecondary
            }
          />
          <Text
            style={[
              styles.controlLabel,
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

        <Pressable
          onPress={() => setSpeedDropdownVisible(true)}
          style={styles.controlButton}
        >
          <Ionicons
            name="speedometer-outline"
            size={22}
            color={theme.colors.textSecondary}
          />
          <Text style={[styles.controlLabel, { color: theme.colors.textSecondary }]}>
            {playbackSpeed.toFixed(2).replace(/\.00$/, "") + "x"}
          </Text>
        </Pressable>
      </View>

      <Modal
        visible={speedDropdownVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSpeedDropdownVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setSpeedDropdownVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>{t("speedTitle") || "Playback Speed"}</Text>
                <FlatList
                  data={[0.5, 0.75, 1.0, 1.25, 1.5]}
                  keyExtractor={(item) => item.toString()}
                  renderItem={({ item }) => {
                    const isSelected = item === playbackSpeed;
                    return (
                      <Pressable
                        style={[
                          styles.optionItem,
                          isSelected && styles.optionItemActive,
                        ]}
                        onPress={() => {
                          onChangeSpeed(item);
                          setSpeedDropdownVisible(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.optionText,
                            isSelected && styles.optionTextActive,
                          ]}
                        >
                          {item.toFixed(2).replace(/\.00$/, "") + "x"}
                        </Text>
                        {isSelected && (
                          <Ionicons
                            name="checkmark"
                            size={18}
                            color={theme.colors.primary}
                          />
                        )}
                      </Pressable>
                    );
                  }}
                  ItemSeparatorComponent={() => <View style={styles.separator} />}
                />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    borderRadius: theme.radii.xl,
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[3],
    paddingBottom: theme.spacing[3],
    gap: theme.spacing[3],
    marginHorizontal: theme.spacing[4],
    marginBottom: theme.spacing[2],
    borderWidth: 1,
    borderColor: theme.colors.border,
    elevation: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
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
    paddingVertical: theme.spacing[1],
  },
  progressTrackDisabled: {
    opacity: 0.55,
  },
  progressBar: {
    height: 6,
    borderRadius: theme.radii.full,
    overflow: "visible",
    justifyContent: "center",
  },
  progressFill: {
    height: 6,
    borderRadius: theme.radii.full,
  },
  thumb: {
    position: "absolute",
    top: -5,
    marginLeft: -8,
    width: 16,
    height: 16,
    borderRadius: theme.radii.full,
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: theme.spacing[1],
  },
  controlButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[1],
    height: 48,
  },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 6,
    marginHorizontal: theme.spacing[2],
  },
  controlLabel: {
    fontSize: 10,
    fontWeight: theme.typography.weights.semibold,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: theme.spacing[6] || 24,
  },
  modalContent: {
    width: "100%",
    maxHeight: 280,
    backgroundColor: theme.colors.card,
    borderRadius: theme.radii.xl || 16,
    padding: theme.spacing[5] || 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
  },
  modalTitle: {
    fontSize: theme.typography.sizes.base || 16,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing[4] || 16,
    textAlign: "center",
  },
  optionItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing[3] || 12,
    paddingHorizontal: theme.spacing[2] || 8,
    borderRadius: theme.radii.md || 8,
  },
  optionItemActive: {
    backgroundColor: "rgba(32, 138, 239, 0.08)",
  },
  optionText: {
    fontSize: theme.typography.sizes.sm || 14,
    color: theme.colors.textSecondary,
  },
  optionTextActive: {
    color: theme.colors.primary,
    fontWeight: theme.typography.weights.semibold,
  },
  separator: {
    height: 1,
    backgroundColor: theme.colors.divider,
  },
}));
