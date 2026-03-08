/**
 * Upload Tab — Kapter
 *
 * Intercepts the Upload tab press to show BottomSheet + YouTubeModal overlays.
 * Actual API mutations are handled via TanStack Query hooks.
 *
 * After a successful upload/submit → navigates to the Processing screen.
 * On error or cancel → returns to Library.
 */
import React, { Fragment, useState } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { BottomSheet, UploadSheet, YouTubeModal } from "@/components";
import { useSubmitYouTube } from "@/hooks/useMedia";
import { ROUTES } from "@/constants/routes";

interface UploadTabProps {
  visible: boolean;
  onClose: () => void;
}

export default function UploadTab({ visible, onClose }: UploadTabProps) {
  const router = useRouter();

  // const [sheetVisible, setSheetVisible] = useState(true);
  const [ytVisible, setYtVisible] = useState(false);

  const { mutateAsync: submitYouTube, isPending: ytPending } =
    useSubmitYouTube();

  /** User dismissed the bottom sheet without choosing anything */
  const handleCloseSheet = () => {
    onClose();
  };

  /** Opens the YouTube URL modal (hides the bottom sheet first) */
  const handleSelectYouTube = () => {
    onClose();
    setTimeout(() => setYtVisible(true), 200);
  };

  /** Opens the device file picker and uploads the chosen file */
  const handleSelectDevice = async () => {
    onClose();
    // Give bottom sheet time to close before navigating
    setTimeout(() => {
      router.push("/media-picker");
    }, 200);
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
    <Fragment>
      <BottomSheet visible={visible} onClose={handleCloseSheet}>
        <UploadSheet
          onSelectDevice={handleSelectDevice}
          onSelectYouTube={handleSelectYouTube}
        />
      </BottomSheet>

      <YouTubeModal
        visible={ytVisible}
        onClose={handleCloseYT}
        onSubmit={handleSubmitYT}
        loading={ytPending}
      />
    </Fragment>
  );
}

// const styles = StyleSheet.create((theme) => ({
//   container: {
//     flex: 1,
//     backgroundColor: theme.colors.background,
//   },
// }));
