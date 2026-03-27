import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import * as WebBrowser from "expo-web-browser";

import {
  IconButton,
  LayerToggle,
  MediaPane,
  PlayerControls,
  SourceActions,
} from "@/components";
import { useActiveSentence } from "@/hooks/useActiveSentence";
import { useMediaPlayback } from "@/hooks/useMediaPlayback";
import { usePlaybackSource } from "@/hooks/usePlaybackSource";
import { usePlayerSubtitles } from "@/hooks/usePlayerSubtitles";
import { useMediaStatus } from "@/hooks/useMedia";
import { ROUTES } from "@/constants/routes";
import { usePlayerStore } from "@/stores/player.store";
import type { Sentence } from "@/types/subtitle";

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { theme } = useUnistyles();
  const { t } = useTranslation("player");
  const [layersVisible, setLayersVisible] = useState(false);

  const { data: mediaItem, isLoading: mediaLoading } = useMediaStatus(
    id ?? null,
  );
  const subtitlesQuery = usePlayerSubtitles(id ?? null);
  const playbackSource = usePlaybackSource(mediaItem);
  const playback = useMediaPlayback(playbackSource.source);
  const segments = subtitlesQuery.data?.segments ?? [];

  const {
    currentTimeSec,
    durationSec,
    isPlaying,
    loopSentence,
    playbackSpeed,
    showKaraoke,
    showPhonetic,
    showTranslation,
    setActiveSentenceIndex,
    setCurrentTime,
    setDuration,
    setIsPlaying,
    setMediaMode,
    setPlaybackSourceKind,
    toggleLayer,
    cycleSpeed,
    toggleLoop,
  } = usePlayerStore();

  const activeSentenceState = useActiveSentence(
    segments,
    playback.currentTimeSec,
  );
  const currentSentenceIndex =
    activeSentenceState.activeSentenceIndex >= 0
      ? activeSentenceState.activeSentenceIndex
      : 0;
  const previousSentence = segments[currentSentenceIndex - 1] ?? null;
  const activeSentence = segments[currentSentenceIndex] ?? null;
  const nextSentence = segments[currentSentenceIndex + 1] ?? null;

  useEffect(() => {
    setCurrentTime(playback.currentTimeSec);
    setDuration(playback.durationSec);
    setIsPlaying(playback.isPlaying);
    setMediaMode(playbackSource.source.kind === "video" ? "video" : "audio");
    setPlaybackSourceKind(playbackSource.source.sourceKind);
  }, [
    playback.currentTimeSec,
    playback.durationSec,
    playback.isPlaying,
    playbackSource.source.kind,
    playbackSource.source.sourceKind,
    setCurrentTime,
    setDuration,
    setIsPlaying,
    setMediaMode,
    setPlaybackSourceKind,
  ]);

  useEffect(() => {
    setActiveSentenceIndex(activeSentenceState.activeSentenceIndex);
  }, [activeSentenceState.activeSentenceIndex, setActiveSentenceIndex]);

  useEffect(() => {
    playback.setRate(playbackSpeed);
  }, [playback, playbackSpeed]);

  useEffect(() => {
    if (
      !loopSentence ||
      !activeSentenceState.activeSentence ||
      !playback.isPlaying
    ) {
      return;
    }

    if (playback.currentTimeSec >= activeSentenceState.activeSentence.end) {
      playback.seekTo(activeSentenceState.activeSentence.start);
      playback.play();
    }
  }, [
    activeSentenceState.activeSentence,
    loopSentence,
    playback,
    playback.currentTimeSec,
    playback.isPlaying,
  ]);

  const title = mediaItem?.title || t("title");
  const playerDisabled = playbackSource.source.kind === "none";

  const handleBack = () => {
    router.replace({ pathname: ROUTES.PROCESSING, params: { id } } as never);
  };

  const handleJumpToSentence = (index: number) => {
    const segment = segments[index];
    if (!segment) {
      return;
    }

    playback.seekTo(segment.start);
    if (!playback.isPlaying && !playerDisabled) {
      playback.play();
    }
  };

  const handleOpenYoutube = async () => {
    if (!mediaItem?.originUrl) {
      return;
    }

    await WebBrowser.openBrowserAsync(mediaItem.originUrl);
  };

  const controlsDisabled = playerDisabled || segments.length === 0;

  const renderStageSentence = (
    sentence: Sentence | null,
    emphasis: "muted" | "active",
    index: number,
  ) => {
    if (!sentence) {
      return <View style={styles.emptySentenceSlot} />;
    }

    const muted = emphasis === "muted";

    return (
      <Pressable
        key={`${sentence.start}-${sentence.end}-${index}`}
        onPress={() => handleJumpToSentence(index)}
        style={({ pressed }) => [
          styles.sentenceBlock,
          muted ? styles.sentenceMuted : styles.sentenceActive,
          pressed && styles.sentencePressed,
        ]}
      >
        <Text
          style={[
            styles.sentenceText,
            muted ? styles.sentenceTextMuted : styles.sentenceTextActive,
            {
              color: muted
                ? theme.colors.textInverse
                : theme.colors.textInverse,
            },
          ]}
        >
          {sentence.text}
        </Text>

        {showPhonetic ? (
          <Text
            style={[
              styles.phoneticText,
              muted ? styles.phoneticMuted : styles.phoneticActive,
              { color: theme.colors.player.phoneticText },
            ]}
          >
            {sentence.phonetic}
          </Text>
        ) : null}

        {showTranslation ? (
          <Text
            style={[
              styles.translationText,
              muted ? styles.translationMuted : styles.translationActive,
              { color: theme.colors.player.translationText },
            ]}
          >
            {sentence.translation}
          </Text>
        ) : null}
      </Pressable>
    );
  };

  return (
    <LinearGradient
      colors={[
        theme.colors.player.gradientStart,
        theme.colors.player.gradientEnd,
      ]}
      style={styles.root}
    >
      <View style={styles.header}>
        <IconButton
          name="chevron-back"
          size={28}
          color={theme.colors.textInverse}
          onPress={handleBack}
          accessibilityLabel="Back"
        />

        <View style={styles.headerTitles}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text
            style={[styles.headerEyebrow, { color: theme.colors.primaryLight }]}
          >
            KAPTER SUBTITLE PLAYER
          </Text>
        </View>

        <IconButton
          name={mediaItem?.originUrl ? "open-outline" : "ellipsis-horizontal"}
          size={24}
          color={theme.colors.textInverse}
          onPress={
            mediaItem?.originUrl
              ? handleOpenYoutube
              : () => setLayersVisible(true)
          }
        />
      </View>

      <View style={styles.content}>
        {mediaLoading ||
        subtitlesQuery.isLoading ||
        playbackSource.isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text
              style={[styles.stateText, { color: theme.colors.textInverse }]}
            >
              {t("loading")}
            </Text>
          </View>
        ) : !mediaItem || subtitlesQuery.isError ? (
          <View style={styles.centerState}>
            <Text style={[styles.stateText, { color: theme.colors.error }]}>
              {t("error")}
            </Text>
          </View>
        ) : segments.length === 0 ? (
          <View style={styles.centerState}>
            <Text
              style={[styles.stateText, { color: theme.colors.textInverse }]}
            >
              {t("noSubtitles")}
            </Text>
          </View>
        ) : (
          <>
            {playbackSource.source.kind === "video" ? (
              <MediaPane
                title={title}
                thumbnailUrl={mediaItem.thumbnailUrl}
                originType={mediaItem.originType}
                source={playbackSource.source}
                videoPlayer={playback.videoPlayer}
              />
            ) : null}

            <View style={styles.stage}>
              {renderStageSentence(
                previousSentence,
                "muted",
                Math.max(currentSentenceIndex - 1, 0),
              )}
              {renderStageSentence(
                activeSentence,
                "active",
                currentSentenceIndex,
              )}
              {renderStageSentence(
                nextSentence,
                "muted",
                Math.min(currentSentenceIndex + 1, segments.length - 1),
              )}
            </View>
          </>
        )}
      </View>

      <View
        style={[
          styles.footerShell,
          { backgroundColor: "rgba(15, 23, 42, 0.92)" },
        ]}
      >
        <PlayerControls
          currentTimeSec={currentTimeSec}
          durationSec={durationSec}
          isPlaying={isPlaying}
          loopSentence={loopSentence}
          playbackSpeed={playbackSpeed}
          disabled={controlsDisabled}
          onTogglePlayback={() =>
            isPlaying ? playback.pause() : playback.play()
          }
          onSeek={playback.seekTo}
          onPrevious={() =>
            handleJumpToSentence(Math.max(currentSentenceIndex - 1, 0))
          }
          onNext={() =>
            handleJumpToSentence(
              Math.min(currentSentenceIndex + 1, segments.length - 1),
            )
          }
          onCycleSpeed={cycleSpeed}
          onToggleLoop={toggleLoop}
        />

        {mediaItem ? (
          <SourceActions
            mediaItem={mediaItem}
            source={playbackSource.source}
            onOpenLayers={() => setLayersVisible(true)}
            onOpenYoutube={handleOpenYoutube}
          />
        ) : null}
      </View>

      <LayerToggle
        visible={layersVisible}
        onClose={() => setLayersVisible(false)}
        showPhonetic={showPhonetic}
        showTranslation={showTranslation}
        showKaraoke={showKaraoke}
        onToggleLayer={toggleLayer}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[12],
    paddingBottom: theme.spacing[4],
  },
  headerTitles: {
    flex: 1,
    alignItems: "center",
    gap: theme.spacing[1],
  },
  headerTitle: {
    color: theme.colors.textInverse,
    fontSize: theme.typography.sizes["2xl"],
    fontWeight: theme.typography.weights.bold,
  },
  headerEyebrow: {
    fontSize: theme.typography.sizes.xs,
    fontWeight: theme.typography.weights.bold,
    letterSpacing: 2.2,
  },
  content: {
    flex: 1,
    paddingHorizontal: theme.spacing[6],
    justifyContent: "center",
  },
  stage: {
    flex: 1,
    justifyContent: "center",
    gap: theme.spacing[8],
  },
  sentenceBlock: {
    gap: theme.spacing[2],
    alignSelf: "stretch",
  },
  sentencePressed: {
    opacity: 0.88,
  },
  sentenceMuted: {
    opacity: 0.38,
  },
  sentenceActive: {
    transform: [{ scale: 1.06 }],
  },
  sentenceText: {
    lineHeight: 50,
  },
  sentenceTextMuted: {
    fontSize: theme.typography.sizes["3xl"],
    fontWeight: theme.typography.weights.medium,
  },
  sentenceTextActive: {
    fontSize: theme.typography.sizes["4xl"],
    fontWeight: theme.typography.weights.bold,
  },
  phoneticText: {
    lineHeight: 34,
  },
  phoneticMuted: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.medium,
  },
  phoneticActive: {
    fontSize: theme.typography.sizes["2xl"],
    fontWeight: theme.typography.weights.bold,
  },
  translationText: {
    lineHeight: 34,
  },
  translationMuted: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.medium,
  },
  translationActive: {
    fontSize: theme.typography.sizes["2xl"],
    fontWeight: theme.typography.weights.bold,
  },
  emptySentenceSlot: {
    minHeight: 72,
  },
  footerShell: {
    borderTopLeftRadius: theme.radii["2xl"],
    borderTopRightRadius: theme.radii["2xl"],
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingBottom: theme.spacing[8],
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[3],
  },
  stateText: {
    fontSize: 14,
    textAlign: "center",
  },
}));
