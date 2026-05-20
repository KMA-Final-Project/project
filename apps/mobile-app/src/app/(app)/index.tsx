/**
 * Media Library (Home Tab) — Kapter
 */
import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SearchBar, FilterChips } from "@/components";
import { MediaCard } from "@/components/media/MediaCard";
import { useMediaStore } from "@/stores/media.store";
import { useMediaList } from "@/hooks/useMedia";
import type { MediaItem } from "@/types/media";
import { ROUTES } from "@/constants/routes";
import { useAuthStore } from "@/stores/auth.store";
import { Ionicons } from "@expo/vector-icons";

export default function LibraryScreen() {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { filter, setFilter } = useMediaStore();
  const [searchQuery, setSearchQuery] = useState("");
  const user = useAuthStore((s) => s.user);

  const { data: items = [], isLoading, isFetching, refetch } = useMediaList();

  const onRefresh = async () => {
    await refetch();
  };

  const handleMediaPress = (item: MediaItem) => {
    const pathname =
      item.status === "COMPLETED" ? ROUTES.PLAYER : ROUTES.PROCESSING;

    router.push({
      pathname,
      params: { id: item.id },
    } as any);
  };

  const filterOptions = [
    { key: "ALL", label: t("library.filters.all") },
    { key: "PROCESSING", label: t("library.filters.processing") },
    { key: "COMPLETED", label: t("library.filters.completed") },
    { key: "FAILED", label: t("library.filters.failed") },
  ];

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Apply status filter
      if (
        filter === "PROCESSING" &&
        !["QUEUED", "VALIDATING", "PROCESSING"].includes(item.status)
      )
        return false;
      if (filter === "COMPLETED" && item.status !== "COMPLETED") return false;
      if (filter === "FAILED" && item.status !== "FAILED") return false;

      // Apply search string
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const title = item.title?.toLowerCase() || "";
        if (!title.includes(query)) return false;
      }
      return true;
    });
  }, [items, filter, searchQuery]);

  return (
    <View style={styles.root}>
      {/* Custom Library Header */}
      <View
        style={[styles.header, { paddingTop: insets.top + theme.spacing[4] }]}
      >
        <Text style={styles.headerTitle}>{t("library.title")}</Text>
        {/* User Avatar */}
        <View style={styles.avatarContainer}>
          <Text style={styles.avatarText}>
            {user?.fullName ? user.fullName[0].toUpperCase() : "U"}
          </Text>
        </View>
      </View>

      <View style={styles.headerControls}>
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t("library.searchPlaceholder")}
        />
        <View style={styles.chipWrapper}>
          <FilterChips
            options={filterOptions}
            selected={filter}
            onSelect={setFilter}
          />
        </View>
      </View>

      {isLoading && items.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
            />
          }
          renderItem={({ item }) => (
            <MediaCard item={item} onPress={handleMediaPress} />
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="film-outline" size={64} color={theme.colors.border} style={styles.emptyIcon} />
              <Text style={styles.emptyTitle}>{t("library.empty")}</Text>
              <Text style={styles.emptySubtitle}>
                {t("library.emptySubtitle", "Import audio, video or paste a YouTube link to generate subtitles")}
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
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing[4],
    paddingBottom: theme.spacing[4],
    backgroundColor: theme.colors.background,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
    letterSpacing: -0.5,
  },
  avatarContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: theme.colors.textOnPrimary,
    fontWeight: "bold",
    fontSize: 16,
  },
  headerControls: {
    paddingHorizontal: theme.spacing[4],
    paddingBottom: theme.spacing[2],
    backgroundColor: theme.colors.background,
    zIndex: 1,
  },
  chipWrapper: {
    marginTop: theme.spacing[3],
  },
  listContent: {
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[2],
    paddingBottom: theme.spacing[10],
    flexGrow: 1,
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing[16],
    gap: theme.spacing[2],
  },
  emptyIcon: {
    marginBottom: theme.spacing[2],
  },
  emptyTitle: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: theme.spacing[8],
    lineHeight: 20,
  },
}));
