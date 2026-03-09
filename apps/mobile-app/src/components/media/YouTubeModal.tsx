/**
 * YouTubeModal — Kapter
 *
 * Modal dialog for pasting / typing a YouTube URL.
 *
 * Design from Stitch "Kapter YouTube URL Input Modal":
 *   - Large modal over blurred background
 *   - Title + placeholder showing a YouTube video preview area
 *   - URL text input with clipboard paste button
 *   - Cancel and Submit action buttons
 */
import React, { useState } from "react";
import {
  View,
  Text,
  Modal,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useDebounce } from "@/hooks/useDebounce";
import { useQuery } from "@tanstack/react-query";
import {
  extractYouTubeId,
  getYouTubeThumbnailUrl,
  isValidYouTubeUrl,
} from "@/validations/youtube";

interface YouTubeModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (url: string) => Promise<void>;
  loading?: boolean;
}

export function YouTubeModal({
  visible,
  onClose,
  onSubmit,
  loading = false,
}: YouTubeModalProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const [url, setUrl] = useState("");
  const debouncedUrl = useDebounce(url, 500); // 500ms debounce
  // loading state now derived from props
  const [error, setError] = useState<string | null>(null);

  const videoId = extractYouTubeId(debouncedUrl);

  const { data: fetchedMetadata, isLoading: fetchingMeta } = useQuery({
    queryKey: ["youtube-metadata", videoId],
    queryFn: async () => {
      if (!videoId) return null;
      try {
        const res = await fetch(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(debouncedUrl)}&format=json`,
        );
        if (!res.ok) throw new Error("Metadata not found");
        const data = await res.json();
        return {
          title: data.title,
          thumbnailUrl: data.thumbnail_url || getYouTubeThumbnailUrl(videoId),
        };
      } catch {
        // Fallback gracefully if oembed fails or is blocked
        return {
          title: undefined,
          thumbnailUrl: getYouTubeThumbnailUrl(videoId),
        };
      }
    },
    enabled: !!videoId,
    staleTime: 1000 * 60 * 5, // 5 mins cache
  });

  const metadata = videoId
    ? fetchedMetadata || {
        title: undefined,
        thumbnailUrl: getYouTubeThumbnailUrl(videoId),
      }
    : null;

  const handlePaste = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      setUrl(text);
      setError(null);
    } catch {
      // Silently fail
    }
  };

  const handleSubmit = async () => {
    if (!isValidYouTubeUrl(url)) {
      setError("Invalid YouTube URL");
      return;
    }
    setError(null);
    try {
      await onSubmit(url.trim());
      setUrl("");
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "An error occurred");
    }
  };

  const handleClose = () => {
    setUrl("");
    setError(null);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      hardwareAccelerated={true}
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.overlay}
        enabled={Platform.OS === "ios"}
      >
        <Pressable style={styles.backdrop} onPress={handleClose} />

        <View style={[styles.sheet, { backgroundColor: theme.colors.card }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.colors.text }]}>
              {t("upload.youtubeVideo")}{" "}
              {/* Using existing key until we add new ones */}
            </Text>
            <Pressable onPress={handleClose} hitSlop={8}>
              <Ionicons
                name="close"
                size={24}
                color={theme.colors.textSecondary}
              />
            </Pressable>
          </View>

          {/* Video preview placeholder */}
          <View
            style={[styles.preview, { backgroundColor: theme.colors.surface }]}
          >
            {extractYouTubeId(debouncedUrl) ? (
              <>
                {fetchingMeta ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : metadata?.title ? (
                  <Text style={styles.previewTitle} numberOfLines={2}>
                    {metadata.title}
                  </Text>
                ) : null}
                <Image
                  source={{
                    uri:
                      metadata?.thumbnailUrl ||
                      getYouTubeThumbnailUrl(extractYouTubeId(debouncedUrl)!),
                  }}
                  style={StyleSheet.absoluteFillObject}
                  resizeMode="cover"
                />
                <View
                  style={[
                    StyleSheet.absoluteFillObject,
                    {
                      backgroundColor: "rgba(0,0,0,0.4)",
                      alignItems: "center",
                      justifyContent: "center",
                      paddingHorizontal: 16,
                    },
                  ]}
                >
                  <Ionicons
                    name="logo-youtube"
                    size={40}
                    color="#EF4444"
                    style={{ marginBottom: 8 }}
                  />
                </View>
              </>
            ) : (
              <>
                <Ionicons name="logo-youtube" size={40} color="#EF4444" />
                <Text
                  style={[
                    styles.previewLabel,
                    { color: theme.colors.textTertiary },
                  ]}
                >
                  {url
                    ? url
                    : t(
                        "upload.youtube.previewPlaceholder",
                        "Video preview will appear here",
                      )}
                </Text>
              </>
            )}
          </View>

          {/* URL Input Row */}
          <View
            style={[
              styles.inputRow,
              {
                backgroundColor: theme.colors.surface,
                borderColor: error ? theme.colors.error : theme.colors.border,
              },
            ]}
          >
            <Ionicons
              name="link-outline"
              size={18}
              color={theme.colors.placeholder}
              style={styles.inputIcon}
            />
            <TextInput
              style={[styles.input, { color: theme.colors.text }]}
              value={url}
              onChangeText={(v) => {
                setUrl(v);
                setError(null);
              }}
              placeholder={t("upload.pastePlaceholder")}
              placeholderTextColor={theme.colors.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="done"
            />
            <Pressable onPress={handlePaste} hitSlop={8}>
              <Text style={[styles.pasteBtn, { color: theme.colors.primary }]}>
                Paste
              </Text>
            </Pressable>
          </View>

          {/* Error message */}
          {error && (
            <Text style={[styles.errorText, { color: theme.colors.error }]}>
              {error}
            </Text>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable
              style={[
                styles.btnSecondary,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surface,
                },
              ]}
              onPress={handleClose}
            >
              <Text
                style={[
                  styles.btnSecondaryText,
                  { color: theme.colors.textSecondary },
                ]}
              >
                {t("common.cancel")}
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.btnPrimary,
                {
                  backgroundColor:
                    loading || !url
                      ? theme.colors.border
                      : theme.colors.primary,
                },
              ]}
              onPress={handleSubmit}
              disabled={loading || !url}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.btnPrimaryText}>Submit</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create((theme) => ({
  overlay: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: theme.spacing[4],
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    borderRadius: theme.radii["2xl"],
    padding: theme.spacing[6],
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 10,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing[5],
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  preview: {
    height: 180,
    borderRadius: theme.radii.xl,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: theme.spacing[4],
    overflow: "hidden",
    position: "relative",
  },
  previewTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "left",
    position: "absolute",
    top: theme.spacing[2],
    left: theme.spacing[3],
    right: theme.spacing[3],
    zIndex: 1,
  },
  previewLabel: {
    fontSize: 12,
    textAlign: "center",
    paddingHorizontal: theme.spacing[4],
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: theme.radii.xl,
    paddingHorizontal: theme.spacing[4],
    height: 48,
    marginBottom: theme.spacing[1],
  },
  inputIcon: {
    marginRight: theme.spacing[2],
  },
  input: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  pasteBtn: {
    fontSize: 14,
    fontWeight: "700",
    paddingLeft: theme.spacing[2],
  },
  errorText: {
    fontSize: 12,
    marginBottom: theme.spacing[3],
    marginTop: 2,
  },
  actions: {
    flexDirection: "row",
    gap: theme.spacing[3],
    marginTop: theme.spacing[5],
  },
  btnSecondary: {
    flex: 1,
    height: 48,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  btnSecondaryText: {
    fontSize: 15,
    fontWeight: "600",
  },
  btnPrimary: {
    flex: 2,
    height: 48,
    borderRadius: theme.radii.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimaryText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
}));
