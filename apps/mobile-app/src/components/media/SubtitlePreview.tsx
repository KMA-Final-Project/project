/**
 * SubtitlePreview — Kapter
 *
 * Renders a live preview of the first N accumulated subtitle sentences
 * during media processing. Shows original text + translation when available.
 */
import React from "react";
import { View, Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import type { Sentence } from "@/types/subtitle";

interface SubtitlePreviewProps {
  sentences: Sentence[];
  isLoading: boolean;
  titleKey?: string;
}

export function SubtitlePreview({
  sentences,
  isLoading,
  titleKey = "subtitlePreview.title",
}: SubtitlePreviewProps) {
  const { t } = useTranslation("processing");

  if (sentences.length === 0 && !isLoading) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{t(titleKey as any)}</Text>

      {sentences.map((sentence, index) => (
        <View key={`${sentence.start}-${index}`} style={styles.sentenceCard}>
          <Text style={styles.originalText}>{sentence.text}</Text>
          {sentence.translation ? (
            <Text style={styles.translationText}>{sentence.translation}</Text>
          ) : null}
        </View>
      ))}

      {isLoading && sentences.length === 0 ? (
        <Text style={styles.loadingText}>{t("subtitlePreview.loading")}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    marginTop: theme.spacing[4],
    paddingHorizontal: theme.spacing[4],
  },
  heading: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[2],
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  sentenceCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    padding: theme.spacing[3],
    marginBottom: theme.spacing[2],
  },
  originalText: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.text,
    lineHeight: theme.typography.lineHeights.normal,
  },
  translationText: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.primary,
    marginTop: theme.spacing[1],
    lineHeight: theme.typography.lineHeights.normal,
    fontStyle: "italic" as const,
  },
  loadingText: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.textTertiary,
    textAlign: "center" as const,
    paddingVertical: theme.spacing[3],
  },
}));
