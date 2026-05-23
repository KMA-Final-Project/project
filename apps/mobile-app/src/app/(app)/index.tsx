/**
 * Media Library (Home Tab) — Kapter
 *
 * Implements a premium visual layout with a collapsible brand header.
 * Scroll animation scales, translates and fades out the brand header,
 * fading in a compact top bar.
 */
import React, { useState, useMemo, useRef } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  RefreshControl,
  Animated,
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

  // ─── Animation Drivers ──────────────────────────────────────────
  const scrollY = useRef(new Animated.Value(0)).current;

  // Header background / border bottom opacity
  const stickyHeaderBgOpacity = scrollY.interpolate({
    inputRange: [0, 80],
    outputRange: [0, 0.98],
    extrapolate: "clamp",
  });

  // Large Brand Title + Avatar: scale, translate & fade
  const titleScale = scrollY.interpolate({
    inputRange: [0, 80],
    outputRange: [1, 0.85],
    extrapolate: "clamp",
  });

  const titleOpacity = scrollY.interpolate({
    inputRange: [0, 50],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const titleTranslateY = scrollY.interpolate({
    inputRange: [0, 80],
    outputRange: [0, -15],
    extrapolate: "clamp",
  });

  // Sticky Top Bar Title: fade in
  const compactTitleOpacity = scrollY.interpolate({
    inputRange: [40, 80],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  // Controls container (Search + Chips): translate & fade out
  const controlsTranslateY = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [0, -70],
    extrapolate: "clamp",
  });

  const controlsOpacity = scrollY.interpolate({
    inputRange: [0, 60],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  return (
    <View style={styles.root}>
      {/* Fixed Sticky Compact Top Bar */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.stickyHeader,
          {
            height: insets.top + 56,
            paddingTop: insets.top,
            opacity: stickyHeaderBgOpacity,
            backgroundColor: theme.colors.background,
            borderBottomColor: theme.colors.border,
          },
        ]}
      >
        <Animated.Text style={[styles.stickyTitle, { color: theme.colors.text, opacity: compactTitleOpacity }]}>
          {t("library.title", "Kapter")}
        </Animated.Text>
      </Animated.View>

      {isLoading && items.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <Animated.FlatList
          data={filteredItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            {
              paddingTop: insets.top + 20,
              paddingBottom: 120, // Leave space for floating bottom pill nav bar
            },
          ]}
          showsVerticalScrollIndicator={false}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: true }
          )}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
              progressViewOffset={insets.top + 20}
            />
          }
          ListHeaderComponent={
            <View style={styles.headerContainer}>
              {/* Large Collapsible App Header */}
              <Animated.View
                style={[
                  styles.header,
                  {
                    opacity: titleOpacity,
                    transform: [
                      { scale: titleScale },
                      { translateY: titleTranslateY },
                    ],
                  },
                ]}
              >
                <Text style={styles.headerTitle}>
                  {t("library.title", "Kapter")}
                </Text>
                {/* User Avatar */}
                <View style={styles.avatarContainer}>
                  <Text style={styles.avatarText}>
                    {user?.fullName ? user.fullName[0].toUpperCase() : "U"}
                  </Text>
                </View>
              </Animated.View>

              {/* Large Collapsible Search & Filter Area */}
              <Animated.View
                style={[
                  styles.headerControls,
                  {
                    opacity: controlsOpacity,
                    transform: [{ translateY: controlsTranslateY }],
                  },
                ]}
              >
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
              </Animated.View>
            </View>
          }
          renderItem={({ item }) => (
            <MediaCard item={item} onPress={handleMediaPress} />
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons
                name="film-outline"
                size={64}
                color={theme.colors.border}
                style={styles.emptyIcon}
              />
              <Text style={styles.emptyTitle}>{t("library.empty")}</Text>
              <Text style={styles.emptySubtitle}>
                {t(
                  "library.emptySubtitle",
                  "Import audio, video or paste a YouTube link to generate subtitles"
                )}
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
  stickyHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 1,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  stickyTitle: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  headerContainer: {
    marginBottom: theme.spacing[4],
    backgroundColor: "transparent",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing[4],
    paddingBottom: theme.spacing[4],
    backgroundColor: "transparent",
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
    letterSpacing: -0.8,
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
    backgroundColor: "transparent",
  },
  chipWrapper: {
    marginTop: theme.spacing[4],
  },
  listContent: {
    paddingHorizontal: theme.spacing[4],
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
