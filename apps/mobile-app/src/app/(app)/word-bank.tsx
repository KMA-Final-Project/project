import React, { memo, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { LinearTransition } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import { ScreenHeader } from "@/components";
import { useWordBank } from "@/hooks/useWordBank";
import { ROUTES } from "@/constants/routes";
import type {
  WordBankContextItem,
  WordBankGroupItem,
} from "@/types/word-bank";

interface WordBankRowProps {
  item: WordBankGroupItem;
  expanded: boolean;
  onToggle: (vocabularyId: string) => void;
  onOpenMedia: (context: WordBankContextItem) => void;
}

const formatSavedAt = (value: string) => dayjs(value).format("DD/MM/YYYY HH:mm");

const WordBankRow = memo(function WordBankRow({
  item,
  expanded,
  onToggle,
  onOpenMedia,
}: WordBankRowProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const latestSavedLabel = useMemo(
    () => formatSavedAt(item.latestSavedAt),
    [item.latestSavedAt],
  );

  return (
    <View
      style={[
        styles.rowShell,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <Pressable
        onPress={() => onToggle(item.vocabularyId)}
        style={({ pressed }) => [styles.rowHeader, pressed && styles.rowPressed]}
      >
        <View style={styles.rowIdentity}>
          <View style={styles.wordLine}>
            <Text style={[styles.word, { color: theme.colors.text }]}>
              {item.word}
            </Text>
            <View
              style={[
                styles.languageBadge,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.languageBadgeText,
                  { color: theme.colors.textSecondary },
                ]}
              >
                {item.sourceLanguage.toUpperCase()}
              </Text>
            </View>
          </View>
          {item.phonetic ? (
            <Text style={[styles.phonetic, { color: theme.colors.textSecondary }]}>
              {item.phonetic}
            </Text>
          ) : null}
          <Text
            style={[styles.rowMeta, { color: theme.colors.textSecondary }]}
            numberOfLines={1}
          >
            {t("wordBank.contextCount", { count: item.contextCount })} ·{" "}
            {t("wordBank.latestSaved", { date: latestSavedLabel })}
          </Text>
        </View>

        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={theme.colors.textSecondary}
        />
      </Pressable>

      {expanded ? (
        <View style={styles.contextList}>
          {item.contexts.map((context) => {
            const isOpenable = context.mediaAvailable;
            const savedAtLabel = formatSavedAt(context.savedAt);

            return (
              <Pressable
                key={context.id}
                disabled={!isOpenable}
                onPress={() => onOpenMedia(context)}
                style={({ pressed }) => [
                  styles.contextCard,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                    opacity: isOpenable ? 1 : 0.78,
                  },
                  pressed && isOpenable && styles.rowPressed,
                ]}
              >
                <View style={styles.contextHeader}>
                  <View style={styles.mediaIdentity}>
                    {context.mediaThumbnailUrl ? (
                      <Image
                        source={{ uri: context.mediaThumbnailUrl }}
                        style={styles.mediaThumb}
                        resizeMode="cover"
                      />
                    ) : (
                      <View
                        style={[
                          styles.mediaThumbFallback,
                          {
                            backgroundColor: theme.colors.card,
                            borderColor: theme.colors.border,
                          },
                        ]}
                      >
                        <Ionicons
                          name={
                            context.mediaOriginType === "YOUTUBE"
                              ? "logo-youtube"
                              : "document-text-outline"
                          }
                          size={18}
                          color={
                            context.mediaOriginType === "YOUTUBE"
                              ? theme.colors.error
                              : theme.colors.primary
                          }
                        />
                      </View>
                    )}

                    <View style={styles.mediaTextBlock}>
                      <Text
                        style={[styles.mediaTitle, { color: theme.colors.text }]}
                        numberOfLines={2}
                      >
                        {context.mediaTitle}
                      </Text>
                      <View style={styles.mediaMetaRow}>
                        <View
                          style={[
                            styles.originBadge,
                            {
                              backgroundColor: theme.colors.card,
                              borderColor: theme.colors.border,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.originBadgeText,
                              { color: theme.colors.textSecondary },
                            ]}
                          >
                            {t(
                              context.mediaOriginType === "YOUTUBE"
                                ? "wordBank.originYoutube"
                                : "wordBank.originLocal",
                            )}
                          </Text>
                        </View>
                        {!context.mediaAvailable ? (
                          <Text
                            style={[
                              styles.mediaUnavailable,
                              { color: theme.colors.error },
                            ]}
                          >
                            {t("wordBank.mediaUnavailable")}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  </View>

                  {isOpenable ? (
                    <Ionicons
                      name="play-circle-outline"
                      size={22}
                      color={theme.colors.primary}
                    />
                  ) : null}
                </View>

                <Text style={[styles.definition, { color: theme.colors.text }]}>
                  {context.savedContextualDefinition}
                </Text>

                <View
                  style={[
                    styles.exampleBlock,
                    {
                      backgroundColor: theme.colors.card,
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.exampleText, { color: theme.colors.text }]}>
                    {context.savedExampleText}
                  </Text>
                  {context.savedExampleTranslation ? (
                    <Text
                      style={[
                        styles.exampleTranslation,
                        { color: theme.colors.player.translationText },
                      ]}
                    >
                      {context.savedExampleTranslation}
                    </Text>
                  ) : null}
                </View>

                <Text
                  style={[styles.savedAtLabel, { color: theme.colors.textSecondary }]}
                >
                  {t("wordBank.savedOn", { date: savedAtLabel })}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
});

export default function WordBankScreen() {
  const router = useRouter();
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const { data, isLoading, isFetching, isError, refetch } = useWordBank();
  const [expandedVocabularyId, setExpandedVocabularyId] = useState<string | null>(
    null,
  );

  const groups = data?.data ?? [];

  const handleToggle = (vocabularyId: string) => {
    setExpandedVocabularyId((current) =>
      current === vocabularyId ? null : vocabularyId,
    );
  };

  const handleOpenMedia = (context: WordBankContextItem) => {
    if (!context.mediaAvailable) {
      return;
    }

    router.push({
      pathname: ROUTES.PLAYER,
      params: { id: context.mediaItemId },
    } as never);
  };

  if (isLoading && groups.length === 0) {
    return (
      <View style={styles.root}>
        <ScreenHeader
          title={t("wordBank.title")}
          onBack={() => router.back()}
        />
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text
            style={[styles.stateText, { color: theme.colors.textSecondary }]}
          >
            {t("common.loading")}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <ScreenHeader title={t("wordBank.title")} onBack={() => router.back()} />

      {isError && groups.length === 0 ? (
        <View style={styles.centerState}>
          <Ionicons
            name="cloud-offline-outline"
            size={42}
            color={theme.colors.textTertiary}
          />
          <Text style={[styles.stateTitle, { color: theme.colors.text }]}>
            {t("common.error")}
          </Text>
          <Text style={[styles.stateText, { color: theme.colors.textSecondary }]}>
            {t("wordBank.loadError")}
          </Text>
          <Pressable
            onPress={() => void refetch()}
            style={[
              styles.retryButton,
              { backgroundColor: theme.colors.primary },
            ]}
          >
            <Text
              style={[styles.retryButtonText, { color: theme.colors.textOnPrimary }]}
            >
              {t("common.retry")}
            </Text>
          </Pressable>
        </View>
      ) : (
        <Animated.FlatList
          data={groups}
          keyExtractor={(item) => item.vocabularyId}
          itemLayoutAnimation={LinearTransition}
          renderItem={({ item }: { item: WordBankGroupItem }) => (
            <WordBankRow
              item={item}
              expanded={expandedVocabularyId === item.vocabularyId}
              onToggle={handleToggle}
              onOpenMedia={handleOpenMedia}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={() => void refetch()}
              tintColor={theme.colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons
                name="bookmark-outline"
                size={52}
                color={theme.colors.textTertiary}
              />
              <Text style={[styles.stateTitle, { color: theme.colors.text }]}>
                {t("wordBank.emptyTitle")}
              </Text>
              <Text
                style={[styles.stateText, { color: theme.colors.textSecondary }]}
              >
                {t("wordBank.emptySubtitle")}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[2],
    paddingBottom: 120,
    gap: theme.spacing[3],
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing[6],
    gap: theme.spacing[3],
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: theme.spacing[20],
    paddingHorizontal: theme.spacing[6],
    gap: theme.spacing[3],
  },
  stateTitle: {
    fontSize: theme.typography.sizes.xl,
    fontWeight: theme.typography.weights.bold,
    textAlign: "center",
  },
  stateText: {
    fontSize: theme.typography.sizes.base,
    textAlign: "center",
    lineHeight: 22,
  },
  retryButton: {
    borderRadius: theme.radii.full,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
  },
  retryButtonText: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.bold,
  },
  rowShell: {
    borderWidth: 1,
    borderRadius: theme.radii.xl,
    overflow: "hidden",
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[4],
    gap: theme.spacing[3],
  },
  rowPressed: {
    opacity: 0.9,
  },
  rowIdentity: {
    flex: 1,
    gap: theme.spacing[1],
  },
  wordLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  word: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.bold,
  },
  phonetic: {
    fontSize: theme.typography.sizes.sm,
  },
  rowMeta: {
    fontSize: theme.typography.sizes.xs,
  },
  languageBadge: {
    borderWidth: 1,
    borderRadius: theme.radii.full,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 3,
  },
  languageBadgeText: {
    fontSize: 11,
    fontWeight: theme.typography.weights.semibold,
  },
  contextList: {
    paddingHorizontal: theme.spacing[3],
    paddingBottom: theme.spacing[3],
    gap: theme.spacing[2],
  },
  contextCard: {
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing[3],
    gap: theme.spacing[3],
  },
  contextHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  mediaIdentity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[3],
  },
  mediaThumb: {
    width: 52,
    height: 52,
    borderRadius: theme.radii.md,
  },
  mediaThumbFallback: {
    width: 52,
    height: 52,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  mediaTextBlock: {
    flex: 1,
    gap: theme.spacing[1],
  },
  mediaTitle: {
    fontSize: theme.typography.sizes.base,
    fontWeight: theme.typography.weights.semibold,
  },
  mediaMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  originBadge: {
    borderWidth: 1,
    borderRadius: theme.radii.full,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 4,
  },
  originBadgeText: {
    fontSize: 11,
    fontWeight: theme.typography.weights.medium,
  },
  mediaUnavailable: {
    fontSize: theme.typography.sizes.xs,
    fontWeight: theme.typography.weights.semibold,
  },
  definition: {
    fontSize: theme.typography.sizes.sm,
    lineHeight: 22,
  },
  exampleBlock: {
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing[3],
    gap: theme.spacing[2],
  },
  exampleText: {
    fontSize: theme.typography.sizes.sm,
    lineHeight: 22,
  },
  exampleTranslation: {
    fontSize: theme.typography.sizes.sm,
    lineHeight: 22,
    fontWeight: theme.typography.weights.medium,
  },
  savedAtLabel: {
    fontSize: theme.typography.sizes.xs,
  },
}));
