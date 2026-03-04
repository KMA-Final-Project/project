/**
 * Upload Tab — Kapter
 *
 * This screen mounts the Upload Sheet within a BottomSheet.
 * When the sheet is closed, it navigates back to the library.
 */
import React, { useState } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { BottomSheet, UploadSheet, YouTubeModal } from "@/components";

export default function UploadTab() {
  const router = useRouter();

  // By default when this tab is mounted, the sheet is open
  const [sheetVisible, setSheetVisible] = useState(true);
  const [ytVisible, setYtVisible] = useState(false);

  const handleCloseSheet = () => {
    setSheetVisible(false);
    // Give time for animation to finish before jumping back
    setTimeout(() => {
      router.replace("/");
    }, 200);
  };

  const handleSelectYouTube = () => {
    setSheetVisible(false);
    // Wait for sheet to close before opening modal
    setTimeout(() => {
      setYtVisible(true);
    }, 200);
  };

  const handleSelectDevice = async () => {
    setSheetVisible(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["audio/*", "video/*"], // MP3, MP4, WAV, M4A, WebM (as per design)
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        // User cancelled picker, just go back to library
        setTimeout(() => {
          router.replace("/");
        }, 200);
        return;
      }

      const file = result.assets[0];
      console.log(
        "Selected file from device:",
        file.name,
        file.mimeType,
        file.size,
      );

      // TODO: Phase 3 - Actually upload file to presigned URL
      router.replace("/");
    } catch (error) {
      console.error("Failed to pick document:", error);
      router.replace("/");
    }
  };

  const handleCloseYT = () => {
    setYtVisible(false);
    router.replace("/");
  };

  const handleSubmitYT = async (url: string) => {
    console.log("Submitting YT url:", url);
    // TODO: Phase 3 API Integration
    setYtVisible(false);
    router.replace("/");
  };

  return (
    <View style={styles.container}>
      <BottomSheet visible={sheetVisible} onClose={handleCloseSheet}>
        <UploadSheet
          onSelectDevice={handleSelectDevice}
          onSelectYouTube={handleSelectYouTube}
        />
      </BottomSheet>

      <YouTubeModal
        visible={ytVisible}
        onClose={handleCloseYT}
        onSubmit={handleSubmitYT}
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
