import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import {
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import type { Sentence } from "@/types/subtitle";
import { usePlayerStore } from "@/stores/player.store";

interface FloatingSentenceDrawerProps {
  sentence: Sentence | null;
}

const AnimatedView = Animated.createAnimatedComponent(View);

export function FloatingSentenceDrawer({
  sentence,
}: FloatingSentenceDrawerProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation("player");
  const { width } = useWindowDimensions();
  const [expanded, setExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const progress = useSharedValue(0);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const playbackSpeed = usePlayerStore((state) => state.playbackSpeed);
  const cycleSpeed = usePlayerStore((state) => state.cycleSpeed);
  const replayExplainSentence = usePlayerStore(
    (state) => state.replayExplainSentence,
  );

  const wordEntries = useMemo(() => {
    if (!sentence?.words?.length) {
      return [];
    }

    return sentence.words.filter((word) => Boolean(word.word.trim()));
  }, [sentence?.words]);

  const canExpand = wordEntries.length > 0;
  const drawerWordColumnWidth = 42;
  const drawerHorizontalPadding = theme.spacing[3] * 2;
  const drawerGutter = theme.spacing[2];
  const availableWidth = Math.max(
    width - theme.spacing[10] - drawerHorizontalPadding,
    drawerWordColumnWidth,
  );
  const columnsPerRow = Math.max(
    1,
    Math.floor(availableWidth / (drawerWordColumnWidth + drawerGutter)),
  );
  const wordRows = Math.max(1, Math.ceil(wordEntries.length / columnsPerRow));
  const basePanelHeight = sentence?.translation?.trim() ? 220 : 164;
  const panelHeight = Math.min(
    340,
    basePanelHeight + Math.max(0, wordRows - 2) * 48,
  );
  const isDrawerVisible = expanded || isDragging;

  const panelAnimatedStyle = useAnimatedStyle(
    () => ({
      height: panelHeight * progress.value,
      opacity: progress.value,
      transform: [{ translateY: (1 - progress.value) * 18 }],
      marginTop: theme.spacing[3] * progress.value,
    }),
    [panelHeight, theme.spacing],
  );

  useEffect(() => {
    progress.value = withTiming(expanded ? 1 : 0, { duration: 220 });
  }, [expanded, progress]);

  const toggleExpanded = () => {
    if (!canExpand) {
      return;
    }

    setExpanded((current) => !current);
  };

  const handleReplaySentence = () => {
    if (!sentence) {
      return;
    }

    replayExplainSentence(sentence.start);
  };

  const pillGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetY([-8, 8])
        .onBegin(() => {
          setIsDragging(true);
        })
        .onUpdate((event) => {
          const nextProgress = expanded
            ? 1 - event.translationY / panelHeight
            : -event.translationY / panelHeight;

          progress.value = Math.max(0, Math.min(nextProgress, 1));
        })
        .onEnd((event) => {
          const nextExpanded =
            progress.value > 0.35 ||
            (event.translationY < -18 && canExpand);
          setExpanded(nextExpanded);
        })
        .onFinalize(() => {
          setIsDragging(false);
        }),
    [canExpand, expanded, panelHeight, progress],
  );

  if (!sentence || !canExpand) {
    return null;
  }

  return (
    <View style={styles.root}>
      <GestureDetector gesture={pillGesture}>
        <Pressable
          onPress={toggleExpanded}
          style={[
            isDrawerVisible ? styles.drawer : styles.collapsedPill,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={
            expanded ? t("explainHideDrawer") : t("explainOpenDrawer")
          }
        >
          <View style={styles.handleButton}>
            <View
              style={[
                styles.handle,
                { backgroundColor: theme.colors.placeholder },
              ]}
            />
          </View>

          {isDrawerVisible ? (
            <>
              <View style={styles.actionsRow}>
                <Pressable
                  onPress={handleReplaySentence}
                  style={[
                    styles.iconButton,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={
                    isPlaying
                      ? t("explainPauseSentence")
                      : t("explainPlaySentence")
                  }
                >
                  <Ionicons
                    name={isPlaying ? "pause" : "play"}
                    size={18}
                    color={theme.colors.text}
                  />
                </Pressable>
                <Pressable
                  onPress={cycleSpeed}
                  style={[
                    styles.speedButton,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t("explainChangeSpeed", {
                    speed: playbackSpeed.toFixed(2).replace(/\.00$/, ""),
                  })}
                >
                  <Text style={[styles.speedText, { color: theme.colors.text }]}>
                    {playbackSpeed.toFixed(2).replace(/\.00$/, "")}x
                  </Text>
                </Pressable>
              </View>

              <AnimatedView style={[styles.panel, panelAnimatedStyle]}>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.panelContent}
                >
                  {sentence.translation?.trim() ? (
                    <View
                      style={[
                        styles.contextCard,
                        {
                          backgroundColor: theme.colors.surface,
                          borderColor: theme.colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.contextTranslation,
                          { color: theme.colors.textSecondary },
                        ]}
                      >
                        {sentence.translation}
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.wordList}>
                    {wordEntries.map((word, index) => (
                      <View
                        key={`${word.start}-${word.end}-${index}`}
                        style={styles.wordColumn}
                      >
                        <Text
                          style={[
                            styles.wordPhoneme,
                            { color: theme.colors.player.phoneticText },
                          ]}
                          numberOfLines={1}
                        >
                          {word.phoneme || " "}
                        </Text>
                        <Text
                          style={[styles.wordText, { color: theme.colors.text }]}
                        >
                          {word.word}
                        </Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </AnimatedView>
            </>
          ) : null}
        </Pressable>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    marginTop: theme.spacing[2],
    alignItems: "center",
  },
  drawer: {
    width: "100%",
    borderWidth: 1,
    borderRadius: theme.radii["2xl"],
    paddingHorizontal: theme.spacing[3],
    paddingTop: theme.spacing[2],
    paddingBottom: theme.spacing[3],
    gap: theme.spacing[2],
    elevation: 8,
    shadowColor: theme.colors.text,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  collapsedPill: {
    minWidth: 88,
    borderWidth: 1,
    borderRadius: theme.radii["2xl"],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
  },
  handleButton: {
    alignItems: "center",
  },
  handle: {
    width: 54,
    height: 6,
    borderRadius: theme.radii.full,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    alignSelf: "flex-end",
  },
  iconButton: {
    width: 36,
    height: 36,
    borderWidth: 1,
    borderRadius: theme.radii.xl,
    justifyContent: "center",
    alignItems: "center",
  },
  speedButton: {
    minHeight: 36,
    minWidth: 56,
    borderWidth: 1,
    borderRadius: theme.radii.xl,
    paddingHorizontal: theme.spacing[3],
    alignItems: "center",
    justifyContent: "center",
  },
  speedText: {
    fontSize: theme.typography.sizes.xs,
    fontWeight: theme.typography.weights.bold,
  },
  panel: {
    overflow: "hidden",
  },
  panelContent: {
    gap: theme.spacing[3],
    paddingBottom: theme.spacing[1],
  },
  contextCard: {
    borderWidth: 1,
    borderRadius: theme.radii.xl,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[3],
    gap: theme.spacing[2],
  },
  contextTranslation: {
    fontSize: theme.typography.sizes.sm,
    lineHeight: 22,
  },
  wordList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
    paddingTop: theme.spacing[1],
  },
  wordColumn: {
    width: 42,
    alignItems: "center",
    gap: theme.spacing[1],
  },
  wordPhoneme: {
    fontSize: theme.typography.sizes.xs,
    fontWeight: theme.typography.weights.medium,
  },
  wordText: {
    fontSize: theme.typography.sizes.xl,
    fontWeight: theme.typography.weights.semibold,
  },
}));
