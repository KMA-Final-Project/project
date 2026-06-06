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
import { useIsFocused } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import * as WebBrowser from "expo-web-browser";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  IconButton,
  ExplainBottomSheet,
  LayerToggle,
  LookupCardOverlay,
  MediaPane,
  PlayerControls,
  StreamingTailIndicator,
  SubtitleRow,
  // SourceActions,
} from "@/components";
import { useActiveSentence } from "@/hooks/useActiveSentence";
import { useMediaPlayback } from "@/hooks/useMediaPlayback";
import { usePlaybackSource } from "@/hooks/usePlaybackSource";
import {
  extractLookupError,
  useVocabularyLookup,
} from "@/hooks/useVocabularyLookup";
import { usePlayerSubtitles } from "@/hooks/usePlayerSubtitles";
import { useMediaStatus } from "@/hooks/useMedia";
import { useOnboarding } from "@/hooks/useOnboarding";
import { ROUTES } from "@/constants/routes";
import { usePlayerStore } from "@/stores/player.store";
import type { LookupErrorResponse, LookupResponse } from "@/types/lookup";
import type { Sentence } from "@/types/subtitle";

interface LookupSelection {
  segmentIndex: number;
  sentence: Sentence;
  wordIndex: number;
  wordText: string;
  phonetic: string;
}

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { theme } = useUnistyles();
  const { t } = useTranslation("player");
  const { defaultTargetLanguage } = useOnboarding();
  const isFocused = useIsFocused();
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
  const [lookupSelection, setLookupSelection] = useState<LookupSelection | null>(
    null,
  );
  const [lookupResponse, setLookupResponse] = useState<LookupResponse | null>(
    null,
  );
  const [lookupError, setLookupError] = useState<LookupErrorResponse | null>(
    null,
  );
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [savingSaveToken, setSavingSaveToken] = useState<string | null>(null);
  const [footerHeight, setFooterHeight] = useState(164);
  const sentenceListRef = useRef<FlatList<Sentence>>(null);
  const wasFocusedRef = useRef(false);
  const shouldResumeWhenCoverageArrivesRef = useRef(false);
  const latestLookupRequestIdRef = useRef(0);
  const activeSaveTokenRef = useRef<string | null>(null);

  const { data: mediaItem, isLoading: mediaLoading } = useMediaStatus(
    id ?? null,
  );
  const subtitlesQuery = usePlayerSubtitles(id ?? null);
  const playbackSource = usePlaybackSource(mediaItem);
  const playback = useMediaPlayback(playbackSource.source);
  const {
    currentTimeSec: playbackCurrentTimeSec,
    durationSec: playbackDurationSec,
    isPlaying: playbackIsPlaying,
    play: playMedia,
    pause: pauseMedia,
    seekTo: seekMedia,
    setRate: setPlaybackRate,
    videoPlayer,
  } = playback;
  const { lookupMutation, saveMutation } = useVocabularyLookup(id ?? null);
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
  const lookupBottomOffset = footerHeight + theme.spacing[3];
  const lookupSelectedWordIndex =
    lookupSelection?.segmentIndex != null ? lookupSelection.wordIndex : null;

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    setCurrentTime(playbackCurrentTimeSec);
    setDuration(playbackDurationSec);
    setIsPlaying(playbackIsPlaying);
    setMediaMode(playbackSource.source.kind === "video" ? "video" : "audio");
    setPlaybackSourceKind(playbackSource.source.sourceKind);
  }, [
    playbackCurrentTimeSec,
    playbackDurationSec,
    playbackIsPlaying,
    playbackSource.source.kind,
    playbackSource.source.sourceKind,
    setCurrentTime,
    setDuration,
    setIsPlaying,
    setMediaMode,
    setPlaybackSourceKind,
    isFocused,
  ]);

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    setActiveSentenceIndex(activeSentenceState.activeSentenceIndex);
  }, [activeSentenceState.activeSentenceIndex, isFocused, setActiveSentenceIndex]);

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    setPlaybackRate(playbackSpeed);
  }, [isFocused, playbackSpeed, setPlaybackRate]);

  useEffect(() => {
    if (
      !isFocused ||
      subtitlesQuery.isLoading ||
      mediaLoading ||
      isTranslationLayerAvailable ||
      !showTranslation
    ) {
      return;
    }

    toggleLayer("translation");
  }, [
    subtitlesQuery.isLoading,
    mediaLoading,
    isFocused,
    isTranslationLayerAvailable,
    showTranslation,
    toggleLayer,
  ]);

  useEffect(() => {
    if (
      !isFocused ||
      !loopSentence ||
      !activeSentenceState.activeSentence ||
      !playbackIsPlaying
    ) {
      return;
    }

    if (currentTimeSec >= activeSentenceState.activeSentence.end) {
      seekMedia(activeSentenceState.activeSentence.start);
      playMedia();
    }
  }, [
    activeSentenceState.activeSentence,
    currentTimeSec,
    isFocused,
    loopSentence,
    playbackIsPlaying,
    playMedia,
    seekMedia,
  ]);

  const title = mediaItem?.title || t("title");
  const playerDisabled = playbackSource.source.kind === "none";

  const requestSeek = useCallback(
    (nextTimeSec: number) => {
      latestLookupRequestIdRef.current += 1;
      setLookupSelection(null);
      setLookupResponse(null);
      setLookupError(null);
      setSaveErrorMessage(null);
      setSavingSaveToken(null);
      activeSaveTokenRef.current = null;
      setCurrentTime(nextTimeSec);
      seekMedia(nextTimeSec);

      if (hasCoverageAt(nextTimeSec)) {
        const shouldResume =
          playbackIsPlaying || shouldResumeWhenCoverageArrivesRef.current;

        setPendingSeekTimeSec(null);
        shouldResumeWhenCoverageArrivesRef.current = false;

        if (shouldResume && !playerDisabled) {
          playMedia();
          return;
        }

        pauseMedia();
        return;
      }

      shouldResumeWhenCoverageArrivesRef.current =
        playbackIsPlaying || shouldResumeWhenCoverageArrivesRef.current;
      pauseMedia();
      setPendingSeekTimeSec(nextTimeSec);
    },
    [
      hasCoverageAt,
      pauseMedia,
      playbackIsPlaying,
      playMedia,
      playerDisabled,
      seekMedia,
      setCurrentTime,
    ],
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
  const clearLookup = useCallback(() => {
    latestLookupRequestIdRef.current += 1;
    setLookupSelection(null);
    setLookupResponse(null);
    setLookupError(null);
    setSaveErrorMessage(null);
    setSavingSaveToken(null);
    activeSaveTokenRef.current = null;
  }, []);

  useEffect(() => {
    if (isFocused) {
      wasFocusedRef.current = true;
      return;
    }

    if (!wasFocusedRef.current) {
      return;
    }

    wasFocusedRef.current = false;
    shouldResumeWhenCoverageArrivesRef.current = false;
    pauseMedia();
    setPendingSeekTimeSec(null);
    setExplainVisible(false);
    setExplainSelection(null);
    clearLookup();
  }, [clearLookup, isFocused, pauseMedia]);

  const openExplainSheet = useCallback(
    (segmentIndex: number, sentence: Sentence | null) => {
      shouldResumeWhenCoverageArrivesRef.current = false;
      pauseMedia();
      setExplainSelection({
        segmentIndex,
        sentence,
        targetLanguage: normalizedTargetLanguage ?? defaultTargetLanguage,
      });
      setExplainVisible(true);
    },
    [defaultTargetLanguage, normalizedTargetLanguage, pauseMedia],
  );
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
    if (
      !isFocused ||
      activeSentenceState.activeSentenceIndex < 0 ||
      segments.length === 0 ||
      isPinned
    ) {
      return;
    }

    requestAnimationFrame(() => {
      sentenceListRef.current?.scrollToIndex({
        index: activeSentenceState.activeSentenceIndex,
        animated: true,
        viewPosition: 0.35,
      });
    });
  }, [activeSentenceState.activeSentenceIndex, isFocused, isPinned, segments.length]);

  useEffect(() => {
    if (
      !isFocused ||
      pendingSeekTimeSec == null ||
      !hasCoverageAt(pendingSeekTimeSec)
    ) {
      return;
    }

    setPendingSeekTimeSec(null);

    if (shouldResumeWhenCoverageArrivesRef.current && !playerDisabled) {
      shouldResumeWhenCoverageArrivesRef.current = false;
      playMedia();
      return;
    }

    shouldResumeWhenCoverageArrivesRef.current = false;
  }, [
    hasCoverageAt,
    isFocused,
    pendingSeekTimeSec,
    playMedia,
    playerDisabled,
  ]);

  useEffect(() => {
    if (
      !isFocused ||
      playerDisabled ||
      isFinal ||
      segments.length === 0 ||
      hasCoverageAt(currentTimeSec)
    ) {
      return;
    }

    shouldResumeWhenCoverageArrivesRef.current =
      playbackIsPlaying || shouldResumeWhenCoverageArrivesRef.current;
    pauseMedia();
    setPendingSeekTimeSec(currentTimeSec);
  }, [
    currentTimeSec,
    hasCoverageAt,
    isFinal,
    playbackIsPlaying,
    playerDisabled,
    segments.length,
    isFocused,
    pauseMedia,
  ]);

  const handleTogglePlayback = useCallback(() => {
    if (playerDisabled) {
      return;
    }

    if (playbackIsPlaying) {
      shouldResumeWhenCoverageArrivesRef.current = false;
      pauseMedia();
      return;
    }

    if (!hasCoverageAt(currentTimeSec)) {
      shouldResumeWhenCoverageArrivesRef.current = true;
      setPendingSeekTimeSec(currentTimeSec);
      pauseMedia();
      return;
    }

    playMedia();
  }, [
    currentTimeSec,
    hasCoverageAt,
    pauseMedia,
    playbackIsPlaying,
    playMedia,
    playerDisabled,
  ]);

  const handleOpenExplain = useCallback(() => {
    clearLookup();
    openExplainSheet(currentSentenceIndex, activeExplainSentence);
  }, [activeExplainSentence, clearLookup, currentSentenceIndex, openExplainSheet]);

  const handleCloseExplain = useCallback(() => {
    setExplainVisible(false);
    setExplainSelection(null);
  }, []);

  const handleWordLookup = useCallback(
    (sentence: Sentence, wordIndex: number) => {
      if (!id || sentence.segment_index == null) {
        return;
      }

      const word = sentence.words[wordIndex];
      if (!word) {
        return;
      }

      shouldResumeWhenCoverageArrivesRef.current = false;
      pauseMedia();
      setSaveErrorMessage(null);
      setSavingSaveToken(null);
      activeSaveTokenRef.current = null;
      setLookupError(null);
      setLookupResponse(null);
      setLookupSelection({
        segmentIndex: sentence.segment_index,
        sentence,
        wordIndex,
        wordText: word.word,
        phonetic: word.phoneme ?? "",
      });

      const requestId = latestLookupRequestIdRef.current + 1;
      latestLookupRequestIdRef.current = requestId;

      lookupMutation.mutate(
        {
          segmentIndex: sentence.segment_index,
          wordText: word.word,
          startWordIndex: wordIndex,
          endWordIndex: wordIndex,
        },
        {
          onSuccess: (response) => {
            if (latestLookupRequestIdRef.current !== requestId) {
              return;
            }

            setLookupResponse(response);
            setLookupError(null);
          },
          onError: (error) => {
            if (latestLookupRequestIdRef.current !== requestId) {
              return;
            }

            setLookupResponse(null);
            setLookupError(extractLookupError(error));
          },
        },
      );
    },
    [id, lookupMutation, pauseMedia],
  );

  const handleOpenLookupExplain = useCallback(() => {
    if (!lookupSelection) {
      return;
    }

    clearLookup();
    openExplainSheet(lookupSelection.segmentIndex, lookupSelection.sentence);
  }, [clearLookup, lookupSelection, openExplainSheet]);

  const handleSaveLookup = useCallback(async () => {
    if (
      !lookupSelection ||
      !lookupResponse ||
      !id ||
      lookupResponse.meta.alreadySaved
    ) {
      return;
    }

    const saveToken = lookupResponse.meta.saveToken;
    if (activeSaveTokenRef.current === saveToken) {
      return;
    }

    setSaveErrorMessage(null);
    activeSaveTokenRef.current = saveToken;
    setSavingSaveToken(saveToken);

    try {
      const result = await saveMutation.mutateAsync({
        segmentIndex: lookupSelection.segmentIndex,
        wordText: lookupSelection.wordText,
        startWordIndex: lookupSelection.wordIndex,
        endWordIndex: lookupSelection.wordIndex,
        saveToken,
      });

      setLookupResponse((current) =>
        current && current.meta.saveToken === saveToken
          ? {
              ...current,
              meta: {
                ...current.meta,
                alreadySaved: true,
              },
            }
          : current,
      );

      if (!result.created) {
        setSaveErrorMessage(null);
      }
    } catch (error) {
      const resolved = extractLookupError(error);
      if (activeSaveTokenRef.current === saveToken) {
        setSaveErrorMessage(
          resolved?.message ??
            (normalizedTargetLanguage === "vi"
              ? "Không thể lưu từ này ngay bây giờ."
              : "Unable to save this word right now."),
        );
      }
    } finally {
      if (activeSaveTokenRef.current === saveToken) {
        activeSaveTokenRef.current = null;
        setSavingSaveToken(null);
      }
    }
  }, [id, lookupResponse, lookupSelection, normalizedTargetLanguage, saveMutation]);

  useEffect(() => {
    registerExplainPlaybackHandler(
      !isFocused || playerDisabled
        ? null
        : (startSec: number) => {
            if (playbackIsPlaying) {
              shouldResumeWhenCoverageArrivesRef.current = false;
              pauseMedia();
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
    isFocused,
    pauseMedia,
    playbackIsPlaying,
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
        onWordPress={
          index === activeSentenceState.activeSentenceIndex &&
          item.segment_index != null &&
          item.words.length > 0
            ? (wordIndex) => handleWordLookup(item, wordIndex)
            : undefined
        }
        selectedWordIndex={
          lookupSelection?.segmentIndex != null &&
          item.segment_index === lookupSelection.segmentIndex
            ? lookupSelectedWordIndex
            : null
        }
      />
    ),
    [
      activeSentenceState.activeSentenceIndex,
      handleJumpToSentence,
      handleWordLookup,
      currentTimeSec,
      lookupSelectedWordIndex,
      lookupSelection?.segmentIndex,
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
                videoPlayer={videoPlayer}
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

      <LookupCardOverlay
        visible={lookupSelection != null}
        selectedWord={lookupSelection?.wordText ?? ""}
        selectedPhonetic={lookupSelection?.phonetic ?? ""}
        response={lookupResponse}
        isLoading={
          lookupSelection != null &&
          lookupResponse == null &&
          lookupError == null
        }
        isSaving={
          saveMutation.isPending &&
          savingSaveToken != null &&
          lookupResponse?.meta.saveToken === savingSaveToken
        }
        lookupError={lookupError}
        saveErrorMessage={saveErrorMessage}
        bottomOffset={lookupBottomOffset}
        onClose={clearLookup}
        onExplain={handleOpenLookupExplain}
        onSave={handleSaveLookup}
      />

      <View
        style={[
          styles.footerShell,
          {
            backgroundColor: "transparent",
            paddingBottom: Math.max(insets.bottom, theme.spacing[5]),
          },
        ]}
        onLayout={(event) => {
          setFooterHeight(event.nativeEvent.layout.height);
        }}
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
