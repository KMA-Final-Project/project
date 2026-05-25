import React, { useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import type { LookupErrorResponse, LookupResponse } from "@/types/lookup";

interface LookupCardOverlayProps {
  visible: boolean;
  selectedWord: string;
  selectedPhonetic: string;
  response: LookupResponse | null;
  isLoading: boolean;
  isSaving: boolean;
  lookupError: LookupErrorResponse | null;
  saveErrorMessage: string | null;
  bottomOffset: number;
  onClose: () => void;
  onExplain: () => void;
  onSave: () => void;
}

export function LookupCardOverlay({
  visible,
  selectedWord,
  selectedPhonetic,
  response,
  isLoading,
  isSaving,
  lookupError,
  saveErrorMessage,
  bottomOffset,
  onClose,
  onExplain,
  onSave,
}: LookupCardOverlayProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation("player");

  const displayWord = response?.data.word ?? selectedWord;
  const displayPhonetic = response?.data.phonetic ?? selectedPhonetic;
  const isSaved = response?.meta.alreadySaved ?? false;
  const canSave = Boolean(response) && !isSaved && !isLoading && !isSaving;
  const errorTitle = useMemo(() => {
    switch (lookupError?.code) {
      case "LOOKUP_LIMIT_REACHED":
        return t("lookupLimitReached");
      case "RATE_LIMITED":
        return t("lookupRetryLater");
      case "SUBTITLE_CONTEXT_UNAVAILABLE":
        return t("lookupContextUnavailable");
      default:
        return t("lookupUnavailable");
    }
  }, [lookupError?.code, t]);
  const shellStyle = useMemo<StyleProp<ViewStyle>>(
    () => [styles.shell, { bottom: bottomOffset }],
    [bottomOffset],
  );

  if (!visible) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={shellStyle}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.headerIdentity}>
            <Text style={[styles.word, { color: theme.colors.text }]}>
              {displayWord}
            </Text>
            {displayPhonetic ? (
              <Text
                style={[styles.phonetic, { color: theme.colors.textSecondary }]}
              >
                {displayPhonetic}
              </Text>
            ) : null}
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t("lookupClose")}
            style={({ pressed }) => [pressed && styles.actionPressed]}
          >
            <Ionicons
              name="close-outline"
              size={20}
              color={theme.colors.textSecondary}
            />
          </Pressable>
        </View>

        {isLoading ? (
          <View style={styles.body}>
            <View
              style={[
                styles.loadingRow,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text
                style={[styles.loadingLabel, { color: theme.colors.textSecondary }]}
              >
                {t("lookupLoading")}
              </Text>
            </View>
            <View
              style={[
                styles.skeletonPill,
                { backgroundColor: theme.colors.surface },
              ]}
            />
            <View
              style={[
                styles.skeletonLineWide,
                { backgroundColor: theme.colors.surface },
              ]}
            />
            <View
              style={[
                styles.skeletonLineWide,
                { backgroundColor: theme.colors.surface },
              ]}
            />
            <View
              style={[
                styles.skeletonLineShort,
                { backgroundColor: theme.colors.surface },
              ]}
            />
            <View
              style={[
                styles.contextCard,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <View
                style={[
                  styles.skeletonLineWide,
                  { backgroundColor: theme.colors.card },
                ]}
              />
              <View
                style={[
                  styles.skeletonLineShort,
                  { backgroundColor: theme.colors.card },
                ]}
              />
            </View>
          </View>
        ) : lookupError ? (
          <View style={[styles.body, styles.errorBody]}>
            <View
              style={[
                styles.errorIcon,
                { backgroundColor: theme.colors.errorBg },
              ]}
            >
              <Ionicons
                name="alert-circle-outline"
                size={18}
                color={theme.colors.error}
              />
            </View>
            <Text style={[styles.errorTitle, { color: theme.colors.text }]}>
              {errorTitle}
            </Text>
            {lookupError.message ? (
              <Text
                style={[
                  styles.errorMessage,
                  { color: theme.colors.textSecondary },
                ]}
              >
                {lookupError.message}
              </Text>
            ) : null}
          </View>
        ) : response ? (
          <View style={styles.body}>
            <View
              style={[
                styles.partOfSpeechPill,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <Text style={[styles.partOfSpeech, { color: theme.colors.text }]}>
                {t(`lookupPos.${response.data.partOfSpeech}`)}
              </Text>
            </View>

            <Text style={[styles.definition, { color: theme.colors.text }]}>
              {response.data.contextualDefinition}
            </Text>

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
                  styles.contextLabel,
                  { color: theme.colors.textSecondary },
                ]}
              >
                {t("lookupContextLabel")}
              </Text>
              <Text style={[styles.contextSentence, { color: theme.colors.text }]}>
                {response.data.exampleSentence}
              </Text>
              {response.data.exampleSentenceTranslation ? (
                <Text
                  style={[
                    styles.contextTranslation,
                    { color: theme.colors.player.translationText },
                  ]}
                >
                  {response.data.exampleSentenceTranslation}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {saveErrorMessage ? (
          <Text style={[styles.saveError, { color: theme.colors.error }]}>
            {saveErrorMessage}
          </Text>
        ) : null}

        <View style={styles.footer}>
          <Pressable
            onPress={onExplain}
            accessibilityRole="button"
            style={({ pressed }) => [styles.explainButton, pressed && styles.actionPressed]}
          >
            <Text style={[styles.explainLabel, { color: theme.colors.primary }]}>
              {t("lookupExplain")}
            </Text>
          </Pressable>

          <Pressable
            onPress={onSave}
            disabled={!canSave}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.saveButton,
              {
                backgroundColor: isSaved
                  ? theme.colors.primary
                  : theme.colors.surface,
                borderColor: isSaved
                  ? theme.colors.primary
                  : theme.colors.border,
              },
              !canSave && !isSaved && styles.saveButtonDisabled,
              pressed && canSave && styles.actionPressed,
            ]}
          >
            {isSaving ? (
              <ActivityIndicator
                size="small"
                color={theme.colors.primary}
                style={styles.saveSpinner}
              />
            ) : (
              <Ionicons
                name={isSaved ? "bookmark" : "bookmark-outline"}
                size={16}
                color={
                  isSaved ? theme.colors.textOnPrimary : theme.colors.primary
                }
              />
            )}
            <Text
              style={[
                styles.saveLabel,
                {
                  color: isSaved
                    ? theme.colors.textOnPrimary
                    : theme.colors.text,
                },
              ]}
            >
              {isSaving
                ? t("lookupSaving")
                : isSaved
                  ? t("lookupSaved")
                  : t("lookupSave")}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  shell: {
    position: "absolute",
    left: theme.spacing[5],
    right: theme.spacing[5],
  },
  card: {
    minHeight: 264,
    borderWidth: 1,
    borderRadius: theme.radii["2xl"],
    padding: theme.spacing[4],
    gap: theme.spacing[4],
    shadowColor: theme.colors.text,
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  headerIdentity: {
    flex: 1,
    gap: theme.spacing[1],
  },
  word: {
    fontSize: theme.typography.sizes.xl,
    fontWeight: theme.typography.weights.bold,
  },
  phonetic: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
  },
  body: {
    flex: 1,
    gap: theme.spacing[3],
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    borderWidth: 1,
    borderRadius: theme.radii.xl,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  loadingLabel: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
  },
  skeletonPill: {
    width: 92,
    height: 28,
    borderRadius: theme.radii.full,
  },
  skeletonLineWide: {
    height: 14,
    borderRadius: theme.radii.full,
  },
  skeletonLineShort: {
    width: "72%",
    height: 14,
    borderRadius: theme.radii.full,
  },
  partOfSpeechPill: {
    alignSelf: "flex-start",
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderWidth: 1,
    borderRadius: theme.radii.full,
  },
  partOfSpeech: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.semibold,
  },
  definition: {
    fontSize: theme.typography.sizes.base,
    fontWeight: theme.typography.weights.medium,
    lineHeight: 24,
  },
  contextCard: {
    gap: theme.spacing[2],
    borderWidth: 1,
    borderRadius: theme.radii.xl,
    padding: theme.spacing[3],
  },
  contextLabel: {
    fontSize: theme.typography.sizes.xs,
    fontWeight: theme.typography.weights.bold,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  contextSentence: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: 20,
  },
  contextTranslation: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    lineHeight: 20,
  },
  errorBody: {
    alignItems: "flex-start",
    justifyContent: "center",
  },
  errorIcon: {
    width: 34,
    height: 34,
    borderRadius: theme.radii.full,
    alignItems: "center",
    justifyContent: "center",
  },
  errorTitle: {
    fontSize: theme.typography.sizes.base,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: 22,
  },
  errorMessage: {
    fontSize: theme.typography.sizes.sm,
    lineHeight: 20,
  },
  saveError: {
    fontSize: theme.typography.sizes.xs,
    lineHeight: 18,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  explainButton: {
    paddingVertical: theme.spacing[2],
  },
  explainLabel: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.semibold,
  },
  saveButton: {
    minWidth: 116,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[2],
    borderWidth: 1,
    borderRadius: theme.radii.full,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveSpinner: {
    marginRight: theme.spacing[1],
  },
  saveLabel: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.semibold,
  },
  actionPressed: {
    opacity: 0.78,
  },
}));
