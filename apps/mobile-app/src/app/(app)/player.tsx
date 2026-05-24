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
  ExplainBottomSheet,
  LayerToggle,
  MediaPane,
  PlayerControls,
  StreamingTailIndicator,
  SubtitleRow,
  // SourceActions,
} from "@/components";
import { useActiveSentence } from "@/hooks/useActiveSentence";
import { useMediaPlayback } from "@/hooks/useMediaPlayback";
import { usePlaybackSource } from "@/hooks/usePlaybackSource";
import { usePlayerSubtitles } from "@/hooks/usePlayerSubtitles";
import { useMediaStatus } from "@/hooks/useMedia";
import { useOnboarding } from "@/hooks/useOnboarding";
import { ROUTES } from "@/constants/routes";
import { usePlayerStore } from "@/stores/player.store";
import type { Sentence } from "@/types/subtitle";

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { theme } = useUnistyles();
  const { t } = useTranslation("player");
  const { defaultTargetLanguage } = useOnboarding();
  const insets = useSafeAreaInsets();
  const [layersVisible, setLayersVisible] = useState(false);
  const [explainVisible, setExplainVisible] = useState(false);
  const [explainSelection, setExplainSelection] = useState<{
    segmentIndex: number;
    sentence: Sentence | null;
    targetLanguage: string;
  } | null>(null);
  const [pendingSeekTimeSec, setPendingSeekTimeSec] = useState<number | null>(
    null,
  );
  const sentenceListRef = useRef<FlatList<Sentence>>(null);
  const shouldResumeWhenCoverageArrivesRef = useRef(false);

  const { data: mediaItem, isLoading: mediaLoading } = useMediaStatus(
    id ?? null,
  );
  const subtitlesQuery = usePlayerSubtitles(id ?? null);
  const playbackSource = usePlaybackSource(mediaItem);
  const playback = useMediaPlayback(playbackSource.source);
  const { hasCoverageAt, isFinal, isPartial } = subtitlesQuery;
  const segments = subtitlesQuery.segments;

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
    setPlaybackSpeed,
    toggleLoop,
    isPinned,
    togglePin,
    registerExplainPlaybackHandler,
  } = usePlayerStore();

  const activeSentenceState = useActiveSentence(segments, currentTimeSec);
  const currentSentenceIndex =
    activeSentenceState.activeSentenceIndex >= 0
      ? activeSentenceState.activeSentenceIndex
      : 0;
  const normalizedSourceLanguage = useMemo(
    () =>
      normalizeLanguage(
        subtitlesQuery.metadata?.source_lang ?? mediaItem?.sourceLanguage,
      ),
    [mediaItem?.sourceLanguage, subtitlesQuery.metadata?.source_lang],
  );
  const normalizedTargetLanguage = useMemo(
    () =>
      normalizeLanguage(
        subtitlesQuery.metadata?.target_lang ?? mediaItem?.targetLanguage,
      ),
    [mediaItem?.targetLanguage, subtitlesQuery.metadata?.target_lang],
  );
  const hasTranslationContent = useMemo(
    () => segments.some((sentence) => Boolean(sentence.translation?.trim())),
    [segments],
  );
  const isTranslationLayerAvailable =
    hasTranslationContent &&
    !(
      normalizedSourceLanguage &&
      normalizedTargetLanguage &&
      normalizedSourceLanguage === normalizedTargetLanguage
    );
  const isCoveragePending = pendingSeekTimeSec != null && !isFinal;
  const shouldShowStreamingTail = isPartial && segments.length > 0;
  const pendingSeekLabel = useMemo(
    () =>
      pendingSeekTimeSec == null ? null : formatTimeLabel(pendingSeekTimeSec),
    [pendingSeekTimeSec],
  );

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
    if (!subtitlesQuery.isLoading && !mediaLoading && !isTranslationLayerAvailable && showTranslation) {
      toggleLayer("translation");
    }
  }, [subtitlesQuery.isLoading, mediaLoading, isTranslationLayerAvailable, showTranslation, toggleLayer]);

  useEffect(() => {
    if (
      !loopSentence ||
      !activeSentenceState.activeSentence ||
      !playback.isPlaying
    ) {
      return;
    }

    if (currentTimeSec >= activeSentenceState.activeSentence.end) {
      playback.seekTo(activeSentenceState.activeSentence.start);
      playback.play();
    }
  }, [
    activeSentenceState.activeSentence,
    currentTimeSec,
    loopSentence,
    playback,
    playback.isPlaying,
  ]);

  const title = mediaItem?.title || t("title");
  const playerDisabled = playbackSource.source.kind === "none";

  const requestSeek = useCallback(
    (nextTimeSec: number) => {
      setCurrentTime(nextTimeSec);
      playback.seekTo(nextTimeSec);

      if (hasCoverageAt(nextTimeSec)) {
        const shouldResume =
          playback.isPlaying || shouldResumeWhenCoverageArrivesRef.current;

        setPendingSeekTimeSec(null);
        shouldResumeWhenCoverageArrivesRef.current = false;

        if (shouldResume && !playerDisabled) {
          playback.play();
          return;
        }

        playback.pause();
        return;
      }

      shouldResumeWhenCoverageArrivesRef.current =
        playback.isPlaying || shouldResumeWhenCoverageArrivesRef.current;
      playback.pause();
      setPendingSeekTimeSec(nextTimeSec);
    },
    [hasCoverageAt, playback, playerDisabled, setCurrentTime],
  );

  const handleBack = () => {
    router.replace({ pathname: ROUTES.HOME } as any);
  };

  const handleJumpToSentence = useCallback(
    (index: number) => {
      const segment = segments[index];
      if (!segment) {
        return;
      }

      requestSeek(segment.start);
    },
    [requestSeek, segments],
  );

  const handleOpenYoutube = async () => {
    if (!mediaItem?.originUrl) {
      return;
    }

    await WebBrowser.openBrowserAsync(mediaItem.originUrl);
  };

  const controlsDisabled = playerDisabled || segments.length === 0;
  const activeExplainSentence = segments[currentSentenceIndex] ?? null;
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
    if (activeSentenceState.activeSentenceIndex < 0 || segments.length === 0 || isPinned) {
      return;
    }

    requestAnimationFrame(() => {
      sentenceListRef.current?.scrollToIndex({
        index: activeSentenceState.activeSentenceIndex,
        animated: true,
        viewPosition: 0.35,
      });
    });
  }, [activeSentenceState.activeSentenceIndex, segments.length, isPinned]);

  useEffect(() => {
    if (pendingSeekTimeSec == null || !hasCoverageAt(pendingSeekTimeSec)) {
      return;
    }

    setPendingSeekTimeSec(null);

    if (shouldResumeWhenCoverageArrivesRef.current && !playerDisabled) {
      shouldResumeWhenCoverageArrivesRef.current = false;
      playback.play();
      return;
    }

    shouldResumeWhenCoverageArrivesRef.current = false;
  }, [hasCoverageAt, pendingSeekTimeSec, playback, playerDisabled]);

  useEffect(() => {
    if (
      playerDisabled ||
      isFinal ||
      segments.length === 0 ||
      hasCoverageAt(currentTimeSec)
    ) {
      return;
    }

    shouldResumeWhenCoverageArrivesRef.current =
      playback.isPlaying || shouldResumeWhenCoverageArrivesRef.current;
    playback.pause();
    setPendingSeekTimeSec(currentTimeSec);
  }, [
    currentTimeSec,
    hasCoverageAt,
    isFinal,
    playback,
    playerDisabled,
    segments.length,
  ]);

  const handleTogglePlayback = useCallback(() => {
    if (playerDisabled) {
      return;
    }

    if (isPlaying) {
      shouldResumeWhenCoverageArrivesRef.current = false;
      playback.pause();
      return;
    }

    if (!hasCoverageAt(currentTimeSec)) {
      shouldResumeWhenCoverageArrivesRef.current = true;
      setPendingSeekTimeSec(currentTimeSec);
      playback.pause();
      return;
    }

    playback.play();
  }, [currentTimeSec, hasCoverageAt, isPlaying, playback, playerDisabled]);

  const handleOpenExplain = useCallback(() => {
    shouldResumeWhenCoverageArrivesRef.current = false;
    playback.pause();
    setExplainSelection({
      segmentIndex: currentSentenceIndex,
      sentence: activeExplainSentence,
      targetLanguage: normalizedTargetLanguage ?? defaultTargetLanguage,
    });
    setExplainVisible(true);
  }, [
    activeExplainSentence,
    currentSentenceIndex,
    defaultTargetLanguage,
    normalizedTargetLanguage,
    playback,
  ]);

  const handleCloseExplain = useCallback(() => {
    setExplainVisible(false);
    setExplainSelection(null);
  }, []);

  useEffect(() => {
    registerExplainPlaybackHandler(
      playerDisabled
        ? null
        : (startSec: number) => {
            if (isPlaying) {
              shouldResumeWhenCoverageArrivesRef.current = false;
              playback.pause();
              return;
            }

            shouldResumeWhenCoverageArrivesRef.current = true;
            requestSeek(startSec);
          },
    );

    return () => {
      registerExplainPlaybackHandler(null);
    };
  }, [
    isPlaying,
    playback,
    playerDisabled,
    registerExplainPlaybackHandler,
    requestSeek,
  ]);

  const renderSentenceItem = useCallback(
    ({ item, index }: ListRenderItemInfo<Sentence>) => (
      <SubtitleRow
        sentence={item}
        isActive={index === activeSentenceState.activeSentenceIndex}
        currentTimeSec={currentTimeSec}
        showPhonetic={showPhonetic}
        showTranslation={showTranslation && isTranslationLayerAvailable}
        showKaraoke={showKaraoke}
        onPress={() => handleJumpToSentence(index)}
      />
    ),
    [
      activeSentenceState.activeSentenceIndex,
      handleJumpToSentence,
      currentTimeSec,
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

        <View style={styles.headerActions}>
          {mediaItem?.originUrl ? (
            <IconButton
              name="logo-youtube"
              size={24}
              color="#EF4444"
              onPress={handleOpenYoutube}
              accessibilityLabel="Open on YouTube"
            />
          ) : null}
          <IconButton
            name="layers-outline"
            size={24}
            color={headerTextColor}
            onPress={() => setLayersVisible(true)}
            accessibilityLabel="Layer Settings"
          />
        </View>
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
            {isPartial ? (
              <>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text
                  style={[
                    styles.stateText,
                    { color: theme.colors.textSecondary },
                  ]}
                >
                  {t("waitingFirstBatch")}
                </Text>
              </>
            ) : (
              <Text
                style={[
                  styles.stateText,
                  { color: theme.colors.textSecondary },
                ]}
              >
                {t("noSubtitles")}
              </Text>
            )}
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
              ListFooterComponent={
                shouldShowStreamingTail ? (
                  <StreamingTailIndicator label={t("processingMore")} />
                ) : null
              }
            />
          </>
        )}
      </View>

      {isCoveragePending && pendingSeekLabel ? (
        <View
          style={[
            styles.pendingBanner,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={[styles.pendingText, { color: theme.colors.text }]}>
            {t("waitingForCoverage", { time: pendingSeekLabel })}
          </Text>
        </View>
      ) : null}

      <View
        style={[
          styles.footerShell,
          {
            backgroundColor: "transparent",
            paddingBottom: Math.max(insets.bottom, theme.spacing[5]),
          },
        ]}
      >
        <PlayerControls
          currentTimeSec={currentTimeSec}
          durationSec={durationSec}
          isPlaying={isPlaying}
          isCoveragePending={isCoveragePending}
          loopSentence={loopSentence}
          playbackSpeed={playbackSpeed}
          disabled={controlsDisabled}
          isPinned={isPinned}
          onTogglePlayback={handleTogglePlayback}
          onSeek={requestSeek}
          onPrevious={() =>
            handleJumpToSentence(Math.max(currentSentenceIndex - 1, 0))
          }
          onNext={() =>
            handleJumpToSentence(
              Math.min(currentSentenceIndex + 1, segments.length - 1),
            )
          }
          onChangeSpeed={setPlaybackSpeed}
          onToggleLoop={toggleLoop}
          onTogglePin={togglePin}
          onExplain={handleOpenExplain}
        />
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
      <ExplainBottomSheet
        visible={explainVisible}
        mediaId={id ?? null}
        segmentIndex={explainSelection?.segmentIndex ?? -1}
        sentence={explainSelection?.sentence ?? null}
        targetLanguage={
          explainSelection?.targetLanguage ?? defaultTargetLanguage
        }
        onClose={handleCloseExplain}
      />
    </LinearGradient>
  );
}

function formatTimeLabel(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);

  return `${mins}:${secs.toString().padStart(2, "0")}`;
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
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
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
    borderTopWidth: 0,
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
  pendingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    marginHorizontal: theme.spacing[5],
    marginBottom: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    borderRadius: theme.radii.xl,
    borderWidth: 1,
  },
  pendingText: {
    flex: 1,
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
  },
}));
