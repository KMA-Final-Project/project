import React, { Fragment, useMemo } from "react";
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
  onPress: () => void;
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
}: SubtitleRowProps) {
  const separator = useMemo(
    () => (cjkPattern.test(sentence.text) ? "" : " "),
    [sentence.text],
  );

  const activeWordIndex = useMemo(() => {
    if (!showKaraoke || sentence.words.length === 0) {
      return -1;
    }

    return sentence.words.findIndex(
      (word) => currentTimeSec >= word.start && currentTimeSec <= word.end,
    );
  }, [currentTimeSec, sentence.words, showKaraoke]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      <View style={[styles.container, isActive && styles.containerActive]}>
        <Text style={[styles.source, isActive && styles.sourceActive]}>
          {showKaraoke && sentence.words.length > 0
            ? sentence.words.map((word, index) => (
                <Fragment key={`${word.start}-${word.end}-${index}`}>
                  <Text
                    style={
                      index === activeWordIndex
                        ? styles.wordActive
                        : styles.wordIdle
                    }
                  >
                    {word.word}
                  </Text>
                  {index < sentence.words.length - 1 ? separator : ""}
                </Fragment>
              ))
            : sentence.text}
        </Text>

        {showPhonetic ? (
          <Text style={styles.phonetic}>{sentence.phonetic}</Text>
        ) : null}
        {showTranslation ? (
          <Text style={styles.translation}>{sentence.translation}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  pressed: {
    opacity: 0.9,
  },
  container: {
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    borderRadius: theme.radii.xl,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  containerActive: {
    backgroundColor: theme.colors.player.activeSentenceBg,
    borderColor: theme.colors.primary,
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
  wordIdle: {
    color: theme.colors.text,
  },
  wordActive: {
    color: theme.colors.player.karaokeHighlight,
  },
  phonetic: {
    color: theme.colors.player.phoneticText,
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
  },
  translation: {
    color: theme.colors.player.translationText,
    fontSize: theme.typography.sizes.base,
    fontWeight: theme.typography.weights.medium,
    lineHeight: 22,
  },
}));
