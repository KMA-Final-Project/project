import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  ListRenderItemInfo,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import * as WebBrowser from "expo-web-browser";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  IconButton,
  LayerToggle,
  MediaPane,
  PlayerControls,
  SubtitleRow,
  // SourceActions,
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
  const { t, i18n } = useTranslation("player");
  const insets = useSafeAreaInsets();
  const [layersVisible, setLayersVisible] = useState(false);
  const sentenceListRef = useRef<FlatList<Sentence>>(null);

  const { data: mediaItem, isLoading: mediaLoading } = useMediaStatus(
    id ?? null,
  );
  const subtitlesQuery = usePlayerSubtitles(id ?? null);
  const playbackSource = usePlaybackSource(mediaItem);
  const playback = useMediaPlayback(playbackSource.source);
  const segments = useMemo(
    () => subtitlesQuery.data?.segments ?? [],
    [subtitlesQuery.data?.segments],
  );

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
  const normalizedAppLanguage = useMemo(
    () => normalizeLanguage(i18n.resolvedLanguage ?? i18n.language),
    [i18n.language, i18n.resolvedLanguage],
  );
  const normalizedSourceLanguage = useMemo(
    () =>
      normalizeLanguage(
        subtitlesQuery.data?.metadata.source_lang ?? mediaItem?.sourceLanguage,
      ),
    [mediaItem?.sourceLanguage, subtitlesQuery.data?.metadata.source_lang],
  );
  const hasTranslationContent = useMemo(
    () => segments.some((sentence) => Boolean(sentence.translation?.trim())),
    [segments],
  );
  const isTranslationLayerAvailable =
    hasTranslationContent &&
    (!normalizedSourceLanguage ||
      normalizedAppLanguage !== normalizedSourceLanguage);

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
    if (!isTranslationLayerAvailable && showTranslation) {
      toggleLayer("translation");
    }
  }, [isTranslationLayerAvailable, showTranslation, toggleLayer]);

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
    router.replace({ pathname: ROUTES.HOME } as any);
  };

  const handleJumpToSentence = useCallback(
    (index: number) => {
      const segment = segments[index];
      if (!segment) {
        return;
      }

      playback.seekTo(segment.start);
      if (!playback.isPlaying && !playerDisabled) {
        playback.play();
      }
    },
    [playback, playerDisabled, segments],
  );

  const handleOpenYoutube = async () => {
    if (!mediaItem?.originUrl) {
      return;
    }

    await WebBrowser.openBrowserAsync(mediaItem.originUrl);
  };

  const controlsDisabled = playerDisabled || segments.length === 0;
  const headerTextColor = theme.colors.text;
  const handleScrollToIndexFailed = useCallback(
    ({
      averageItemLength,
      index,
    }: {
      averageItemLength: number;
      index: number;
    }) => {
      const fallbackOffset = Math.max(
        0,
        averageItemLength * index - averageItemLength,
      );

      requestAnimationFrame(() => {
        sentenceListRef.current?.scrollToOffset({
          offset: fallbackOffset,
          animated: true,
        });
      });
    },
    [],
  );

  useEffect(() => {
    if (activeSentenceState.activeSentenceIndex < 0 || segments.length === 0) {
      return;
    }

    requestAnimationFrame(() => {
      sentenceListRef.current?.scrollToIndex({
        index: activeSentenceState.activeSentenceIndex,
        animated: true,
        viewPosition: 0.35,
      });
    });
  }, [activeSentenceState.activeSentenceIndex, segments.length]);

  const renderSentenceItem = useCallback(
    ({ item, index }: ListRenderItemInfo<Sentence>) => (
      <SubtitleRow
        sentence={item}
        isActive={index === activeSentenceState.activeSentenceIndex}
        currentTimeSec={playback.currentTimeSec}
        showPhonetic={showPhonetic}
        showTranslation={showTranslation && isTranslationLayerAvailable}
        showKaraoke={showKaraoke}
        onPress={() => handleJumpToSentence(index)}
      />
    ),
    [
      activeSentenceState.activeSentenceIndex,
      handleJumpToSentence,
      playback.currentTimeSec,
      showKaraoke,
      showPhonetic,
      showTranslation,
      isTranslationLayerAvailable,
    ],
  );

  return (
    <LinearGradient
      colors={[
        theme.colors.player.gradientStart,
        theme.colors.player.gradientEnd,
      ]}
      style={styles.root}
    >
      <View
        style={[styles.header, { paddingTop: insets.top + theme.spacing[3] }]}
      >
        <IconButton
          name="chevron-back"
          size={28}
          color={headerTextColor}
          onPress={handleBack}
          accessibilityLabel="Back"
        />

        <View style={styles.headerTitles}>
          <Text
            style={[styles.headerTitle, { color: headerTextColor }]}
            numberOfLines={1}
          >
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
          color={headerTextColor}
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
              style={[styles.stateText, { color: theme.colors.textSecondary }]}
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
              style={[styles.stateText, { color: theme.colors.textSecondary }]}
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

            <FlatList
              ref={sentenceListRef}
              data={segments}
              keyExtractor={(item, index) =>
                `${item.segment_index ?? index}-${item.start}-${item.end}`
              }
              renderItem={renderSentenceItem}
              style={styles.sentenceList}
              contentContainerStyle={styles.sentenceListContent}
              showsVerticalScrollIndicator={false}
              onScrollToIndexFailed={handleScrollToIndexFailed}
              initialNumToRender={10}
              maxToRenderPerBatch={10}
              windowSize={7}
            />
          </>
        )}
      </View>

      <View
        style={[
          styles.footerShell,
          {
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.divider,
            paddingBottom: Math.max(insets.bottom, theme.spacing[5]),
          },
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

        {/* {mediaItem ? (
          <SourceActions
            mediaItem={mediaItem}
            source={playbackSource.source}
            onOpenLayers={() => setLayersVisible(true)}
            onOpenYoutube={handleOpenYoutube}
          />
        ) : null} */}
      </View>

      <LayerToggle
        visible={layersVisible}
        onClose={() => setLayersVisible(false)}
        showPhonetic={showPhonetic}
        showTranslation={showTranslation && isTranslationLayerAvailable}
        showKaraoke={showKaraoke}
        onToggleLayer={toggleLayer}
        translationEnabled={isTranslationLayerAvailable}
      />
    </LinearGradient>
  );
}

function normalizeLanguage(language: string | null | undefined): string | null {
  if (!language) {
    return null;
  }

  return language.split(/[-_]/)[0]?.toLowerCase() ?? null;
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
    paddingBottom: theme.spacing[4],
    gap: theme.spacing[4],
  },
  headerTitles: {
    flex: 1,
    alignItems: "center",
    gap: theme.spacing[1],
  },
  headerTitle: {
    fontSize: theme.typography.sizes["base"],
    fontWeight: theme.typography.weights.bold,
  },
  headerEyebrow: {
    fontSize: theme.typography.sizes.xs,
    fontWeight: theme.typography.weights.bold,
    letterSpacing: 2.2,
  },
  content: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: theme.spacing[5],
    paddingBottom: theme.spacing[4],
    gap: theme.spacing[4],
  },
  sentenceList: {
    flex: 1,
    minHeight: 0,
  },
  sentenceListContent: {
    gap: theme.spacing[3],
    paddingBottom: theme.spacing[2],
  },
  footerShell: {
    borderTopLeftRadius: theme.radii["2xl"],
    borderTopRightRadius: theme.radii["2xl"],
    borderTopWidth: 1,
    paddingTop: theme.spacing[1],
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
