import React, { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import type { Sentence } from "@/types/subtitle";

interface SubtitleRowProps {
  sentence: Sentence;
  isActive: boolean;
  currentTimeSec: number;
  showPhonetic: boolean;
  showTranslation: boolean;
  showKaraoke: boolean;
  onPress?: () => void;
  onWordPress?: (wordIndex: number) => void;
  selectedWordIndex?: number | null;
}

const cjkPattern = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;

export function SubtitleRow({
  sentence,
  isActive,
  currentTimeSec,
  showPhonetic,
  showTranslation,
  showKaraoke,
  onPress,
  onWordPress,
  selectedWordIndex = null,
}: SubtitleRowProps) {
  const activeWordIndex = useMemo(() => {
    if (!showKaraoke || sentence.words.length === 0) {
      return -1;
    }

    return sentence.words.findIndex(
      (word) => currentTimeSec >= word.start && currentTimeSec <= word.end,
    );
  }, [currentTimeSec, sentence.words, showKaraoke]);

  const isCjk = useMemo(() => cjkPattern.test(sentence.text), [sentence.text]);
  const wordsAreInteractive = isActive && typeof onWordPress === "function";

  const content = (
    <View style={[styles.container, isActive && styles.containerActive]}>
      {sentence.words && sentence.words.length > 0 ? (
        <View style={styles.wordsContainer}>
          {sentence.words.map((word, index) => {
            const isWordSelected = selectedWordIndex === index;
            const isWordActive =
              !isWordSelected && showKaraoke && index === activeWordIndex;
            const wordContent = (
              <View
                style={[
                  styles.wordStack,
                  isWordSelected && styles.wordStackSelected,
                ]}
              >
                {isCjk && showPhonetic && word.phoneme ? (
                  <Text
                    style={[
                      styles.wordPhonetic,
                      isWordSelected
                        ? styles.wordPhoneticSelected
                        : isWordActive
                          ? styles.wordPhoneticActive
                          : styles.wordPhoneticIdle,
                      { marginBottom: 2 },
                    ]}
                  >
                    {word.phoneme}
                  </Text>
                ) : null}

                <Text
                  style={[
                    styles.wordText,
                    isWordSelected
                      ? styles.wordSelected
                      : isWordActive
                        ? styles.wordActive
                        : styles.wordIdle,
                    isActive && styles.wordTextActiveSize,
                  ]}
                >
                  {word.word}
                </Text>

                {!isCjk && showPhonetic && word.phoneme ? (
                  <Text
                    style={[
                      styles.wordPhonetic,
                      isWordSelected
                        ? styles.wordPhoneticSelected
                        : isWordActive
                          ? styles.wordPhoneticActive
                          : styles.wordPhoneticIdle,
                      { marginTop: 2 },
                    ]}
                  >
                    {word.phoneme}
                  </Text>
                ) : null}
              </View>
            );

            if (!wordsAreInteractive) {
              return (
                <View key={`${word.start}-${word.end}-${index}`}>
                  {wordContent}
                </View>
              );
            }

            return (
              <Pressable
                key={`${word.start}-${word.end}-${index}`}
                onPress={() => onWordPress(index)}
                style={({ pressed }) => [pressed && styles.pressed]}
                hitSlop={6}
              >
                {wordContent}
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View>
          <Text style={[styles.source, isActive && styles.sourceActive]}>
            {sentence.text}
          </Text>
          {showPhonetic && Boolean(sentence.phonetic?.trim()) ? (
            <Text style={styles.phonetic}>{sentence.phonetic}</Text>
          ) : null}
        </View>
      )}

      {showTranslation && Boolean(sentence.translation?.trim()) ? (
        <Text style={styles.translation}>{sentence.translation}</Text>
      ) : null}
    </View>
  );

  if (wordsAreInteractive || !onPress) {
    return content;
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.pressed]}
      hitSlop={8}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  pressed: {
    opacity: 0.9,
  },
  container: {
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    borderRadius: theme.radii.xl,
  },
  containerActive: {
    backgroundColor: theme.colors.player.activeSentenceBg,
    borderRadius: theme.radii.xl,
  },
  source: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: 28,
  },
  sourceActive: {
    fontSize: theme.typography.sizes.xl,
  },
  wordsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: theme.spacing[2],
    rowGap: theme.spacing[2],
    alignItems: "flex-end",
  },
  wordStack: {
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: theme.spacing[1],
    paddingVertical: 2,
    borderRadius: theme.radii.lg,
  },
  wordStackSelected: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  wordText: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: 24,
  },
  wordTextActiveSize: {
    fontSize: theme.typography.sizes.xl,
  },
  wordIdle: {
    color: theme.colors.text,
  },
  wordActive: {
    color: theme.colors.player.karaokeHighlight,
  },
  wordSelected: {
    color: theme.colors.primary,
  },
  wordPhonetic: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    lineHeight: 14,
  },
  wordPhoneticIdle: {
    color: theme.colors.textSecondary,
  },
  wordPhoneticActive: {
    color: theme.colors.player.phoneticText,
  },
  wordPhoneticSelected: {
    color: theme.colors.primaryDark,
  },
  phonetic: {
    color: theme.colors.player.phoneticText,
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    lineHeight: 20,
    marginTop: theme.spacing[1],
  },
  translation: {
    color: theme.colors.player.translationText,
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    lineHeight: 22,
    marginTop: theme.spacing[1],
  },
}));
