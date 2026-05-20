import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  Image,
  ActivityIndicator,
  Alert,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import * as MediaLibrary from "expo-media-library";
import * as FileSystem from "expo-file-system";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useUploadMedia } from "@/hooks/useMedia";
import { ROUTES } from "@/constants/routes";
import { useTranslation } from "react-i18next";

export default function MediaPickerScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();

  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [loading, setLoading] = useState(true);

  const [permissionResponse, requestPermission] = MediaLibrary.usePermissions();

  const { mutateAsync: uploadMedia, isPending: uploadPending } =
    useUploadMedia();

  const fetchMedia = useCallback(async () => {
    try {
      setLoading(true);
      const media = await MediaLibrary.getAssetsAsync({
        mediaType: [MediaLibrary.MediaType.video, MediaLibrary.MediaType.audio],
        first: 100,
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      });
      setAssets(media.assets);
    } catch (error) {
      console.error("Failed to fetch media", error);
      Alert.alert(t("common.error", "Error"), t("mediaPicker.errorLoad", "Failed to load media files from device"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (permissionResponse?.status === "granted") {
      fetchMedia();
    } else if (
      permissionResponse?.status === "undetermined" &&
      permissionResponse.canAskAgain
    ) {
      requestPermission();
    }
  }, [permissionResponse, fetchMedia, requestPermission]);

  const handleSelectAsset = async (asset: MediaLibrary.Asset) => {
    try {
      // Need full file info to get actual URIs and sizes on Android/iOS
      const assetInfo = await MediaLibrary.getAssetInfoAsync(asset.id);

      let fileUri = assetInfo.localUri || assetInfo.uri;

      // Get file size from file system
      const fileInfo = await FileSystem.getInfoAsync(fileUri);

      if (!fileInfo.exists) {
        throw new Error("File does not exist on disk");
      }

      // Determine an appropriate mimeType fallback since getAssetInfoAsync doesn't always return it
      let mimeType = "application/octet-stream";
      if (asset.mediaType === "video") mimeType = "video/mp4";
      if (asset.mediaType === "audio") mimeType = "audio/mpeg";

      // Extension fallback
      const ext = asset.filename.split(".").pop()?.toLowerCase();
      if (ext === "mp3") mimeType = "audio/mpeg";
      if (ext === "m4a") mimeType = "audio/mp4";
      if (ext === "wav") mimeType = "audio/wav";

      const newItem = await uploadMedia({
        uri: fileUri,
        name: asset.filename,
        mimeType: mimeType,
        size: fileInfo.size,
      });

      router.replace({
        pathname: ROUTES.PROCESSING,
        params: { id: newItem.id },
      } as any);
    } catch (error: any) {
      console.error("Upload failed:", error);
      Alert.alert(
        "Upload failed",
        error?.response?.data?.message ??
          error?.message ??
          "An unexpected error occurred.",
      );
    }
  };

  const renderItem = ({ item }: { item: MediaLibrary.Asset }) => {
    const isVideo = item.mediaType === "video";
    const minutes = Math.floor(item.duration / 60);
    const seconds = Math.floor(item.duration % 60)
      .toString()
      .padStart(2, "0");
    const durationText = `${minutes}:${seconds}`;

    return (
      <Pressable
        style={({ pressed }) => [
          styles.assetItem,
          {
            backgroundColor: pressed
              ? theme.colors.elevated
              : theme.colors.card,
            borderColor: theme.colors.border,
          },
        ]}
        onPress={() => handleSelectAsset(item)}
        disabled={uploadPending}
      >
        <View
          style={[
            styles.thumbnailContainer,
            { backgroundColor: theme.colors.background },
          ]}
        >
          {isVideo ? (
            <Image
              source={{ uri: item.uri }}
              style={styles.thumbnail}
              resizeMode="cover"
            />
          ) : (
            <Ionicons
              name="musical-notes"
              size={32}
              color={theme.colors.textSecondary}
            />
          )}
          {item.duration > 0 && (
            <View style={styles.durationBadge}>
              <Text style={styles.durationText}>{durationText}</Text>
            </View>
          )}
        </View>

        <View style={styles.assetInfo}>
          <Text
            style={[styles.assetName, { color: theme.colors.text }]}
            numberOfLines={1}
          >
            {item.filename}
          </Text>
          <Text
            style={[styles.assetType, { color: theme.colors.textSecondary }]}
          >
            {isVideo ? t("mediaPicker.video") : t("mediaPicker.audio")} •{" "}
            {new Date(item.creationTime).toLocaleDateString()}
          </Text>
        </View>

        {uploadPending && (
          <View style={styles.uploadOverlay}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={8}
          disabled={uploadPending}
        >
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          {t("mediaPicker.title")}
        </Text>
        <View style={styles.backBtn} />
      </View>

      {permissionResponse?.status !== "granted" ? (
        <View style={styles.centerContainer}>
          <Text
            style={[styles.emptyText, { color: theme.colors.textSecondary }]}
          >
            {t("mediaPicker.permissionRequired")}
          </Text>
          <Pressable onPress={requestPermission} style={styles.grantBtn}>
            <Text style={styles.grantBtnText}>{t("mediaPicker.grantPermission")}</Text>
          </Pressable>
        </View>
      ) : loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : assets.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons
            name="images-outline"
            size={64}
            color={theme.colors.textTertiary}
          />
          <Text
            style={[styles.emptyText, { color: theme.colors.textSecondary }]}
          >
            {t("mediaPicker.noMedia")}
          </Text>
        </View>
      ) : (
        <FlatList
          data={assets}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 24 },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  assetItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  thumbnailContainer: {
    width: 64,
    height: 64,
    borderRadius: 8,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbnail: {
    width: "100%",
    height: "100%",
  },
  durationBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "600",
  },
  assetInfo: {
    flex: 1,
    marginLeft: 16,
  },
  assetName: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  assetType: {
    fontSize: 13,
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  emptyText: {
    fontSize: 16,
    textAlign: "center",
    marginTop: 16,
    marginBottom: 24,
  },
  grantBtn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  grantBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
  uploadOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
}));
