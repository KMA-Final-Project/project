/**
 * Upload Tab — Kapter
 *
 * Intercepts the Upload tab press to show BottomSheet + YouTubeModal overlays.
 * Actual API mutations are handled via TanStack Query hooks.
 */
import React, { useState } from "react";
import { View, Alert } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { BottomSheet, UploadSheet, YouTubeModal } from "@/components";
import { useSubmitYouTube, useUploadMedia } from "@/hooks/useMedia";

export default function UploadTab() {
  const router = useRouter();

  const [sheetVisible, setSheetVisible] = useState(true);
  const [ytVisible, setYtVisible] = useState(false);

  const { mutateAsync: submitYouTube, isPending: ytPending } =
    useSubmitYouTube();
  const { mutateAsync: uploadMedia, isPending: uploadPending } =
    useUploadMedia();

  const handleCloseSheet = () => {
    setSheetVisible(false);
    setTimeout(() => router.replace("/"), 200);
  };

  const handleSelectYouTube = () => {
    setSheetVisible(false);
    setTimeout(() => setYtVisible(true), 200);
  };

  const handleSelectDevice = async () => {
    setSheetVisible(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["audio/*", "video/*"], // MP3, MP4, WAV, M4A, WebM (as per design)
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        setTimeout(() => router.replace("/"), 200);
        return;
      }

      const file = result.assets[0];
      if (!file.mimeType || !file.size) {
        Alert.alert("Unsupported file", "Please select a valid file.");
        setTimeout(() => router.replace("/"), 200);
        return;
      }

      await uploadMedia({
        uri: file.uri,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
      });

      router.replace("/");
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

  const handleCloseYT = () => {
    setYtVisible(false);
    router.replace("/");
  };

  const handleSubmitYT = async (url: string) => {
    try {
      await submitYouTube(url);
      setYtVisible(false);
      router.replace("/");
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
