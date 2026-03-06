/**
 * Upload Tab — Kapter
 *
 * Intercepts the Upload tab press to show BottomSheet + YouTubeModal overlays.
 * Actual API mutations are handled via TanStack Query hooks.
 *
 * After a successful upload/submit → navigates to the Processing screen.
 * On error or cancel → returns to Library.
 */
import React, { useState } from "react";
import { View, Alert } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { BottomSheet, UploadSheet, YouTubeModal } from "@/components";
import { useSubmitYouTube, useUploadMedia } from "@/hooks/useMedia";
import { ROUTES } from "@/constants/routes";

export default function UploadTab() {
  const router = useRouter();

  const [sheetVisible, setSheetVisible] = useState(true);
  const [ytVisible, setYtVisible] = useState(false);

  const { mutateAsync: submitYouTube, isPending: ytPending } =
    useSubmitYouTube();
  const { mutateAsync: uploadMedia, isPending: uploadPending } =
    useUploadMedia();

  /** User dismissed the bottom sheet without choosing anything */
  const handleCloseSheet = () => {
    setSheetVisible(false);
    setTimeout(() => router.replace("/"), 200);
  };

  /** Opens the YouTube URL modal (hides the bottom sheet first) */
  const handleSelectYouTube = () => {
    setSheetVisible(false);
    setTimeout(() => setYtVisible(true), 200);
  };

  /** Opens the device file picker and uploads the chosen file */
  const handleSelectDevice = async () => {
    setSheetVisible(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["audio/*", "video/*"],
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        setTimeout(() => router.replace("/"), 200);
        return;
      }

      const file = result.assets[0];
      if (!file.mimeType || !file.size) {
        Alert.alert(
          "Unsupported file",
          "Please select a valid audio or video file.",
        );
        setTimeout(() => router.replace("/"), 200);
        return;
      }

      // Upload → returns the created MediaItem (has id + status=QUEUED)
      const newItem = await uploadMedia({
        uri: file.uri,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
      });

      // Navigate straight to the processing screen for this item
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
      router.replace("/");
    }
  };

  /** Closes the YouTube modal and goes back to library */
  const handleCloseYT = () => {
    setYtVisible(false);
    router.replace("/");
  };

  /** Submits the YouTube URL and navigates to processing screen */
  const handleSubmitYT = async (url: string) => {
    try {
      const newItem = await submitYouTube(url);

      setYtVisible(false);
      // Navigate to processing screen for this item
      router.replace({
        pathname: ROUTES.PROCESSING,
        params: { id: newItem.id },
      } as any);
    } catch (error: any) {
      console.error("YouTube submit failed:", error);
      Alert.alert(
        "Failed",
        error?.response?.data?.message ??
          error?.message ??
          "An unexpected error occurred.",
      );
    }
  };

  return (
    <View style={styles.container}>
      <BottomSheet visible={sheetVisible} onClose={handleCloseSheet}>
        <UploadSheet
          onSelectDevice={handleSelectDevice}
          onSelectYouTube={handleSelectYouTube}
          disabled={uploadPending}
        />
      </BottomSheet>

      <YouTubeModal
        visible={ytVisible}
        onClose={handleCloseYT}
        onSubmit={handleSubmitYT}
        loading={ytPending}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
}));
