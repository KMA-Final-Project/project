/**
 * UploadSheet — Kapter
 *
 * Bottom sheet content for "Add New Media".
 * Two option cards: From Device and From YouTube.
 *
 * Design from Stitch "Kapter New Upload Bottom Sheet":
 *   - Header: bold title + subtitle
 *   - Two large tappable cards with icon, title, description
 *   - Supported formats note at the bottom
 */
import React from "react";
import { View, Text, Pressable } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

interface UploadSheetProps {
  onSelectDevice: () => void;
  onSelectYouTube: () => void;
}

export function UploadSheet({
  onSelectDevice,
  onSelectYouTube,
}: UploadSheetProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      {/* Header */}
      <Text style={[styles.title, { color: theme.colors.text }]}>
        {t("upload.title")}
      </Text>
      <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
        {t("upload.subtitle")}
      </Text>

      {/* Option Cards */}
      <View style={styles.cards}>
        {/* From Device */}
        <Pressable
          style={({ pressed }) => [
            styles.card,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
          onPress={onSelectDevice}
        >
          <View
            style={[
              styles.iconWrapper,
              {
                backgroundColor: theme.colors.surface,
              },
            ]}
          >
            <Ionicons
              name="folder-open-outline"
              size={28}
              color={theme.colors.primary}
            />
          </View>
          <View style={styles.cardText}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
              {t("upload.fromDevice")}
            </Text>
            <Text
              style={[styles.cardDesc, { color: theme.colors.textSecondary }]}
            >
              {t("upload.fromDeviceDesc")}
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={20}
            color={theme.colors.textTertiary}
          />
        </Pressable>

        {/* From YouTube */}
        <Pressable
          style={({ pressed }) => [
            styles.card,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
          onPress={onSelectYouTube}
        >
          <View
            style={[
              styles.iconWrapper,
              { backgroundColor: "#FEE2E2" }, // YouTube red-tinted bg
            ]}
          >
            <Ionicons name="logo-youtube" size={28} color="#EF4444" />
          </View>
          <View style={styles.cardText}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
              {t("upload.fromYoutube")}
            </Text>
            <Text
              style={[styles.cardDesc, { color: theme.colors.textSecondary }]}
            >
              {t("upload.fromYoutubeDesc")}
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={20}
            color={theme.colors.textTertiary}
          />
        </Pressable>
      </View>

      {/* Formats note */}
      <Text style={[styles.formatsNote, { color: theme.colors.textTertiary }]}>
        {t("upload.supportedFormats")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    paddingTop: theme.spacing[2],
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.3,
    marginBottom: theme.spacing[1],
  },
  subtitle: {
    fontSize: 14,
    marginBottom: theme.spacing[6],
  },
  cards: {
    gap: theme.spacing[3],
    marginBottom: theme.spacing[5],
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: theme.spacing[4],
    borderRadius: theme.radii.xl,
    borderWidth: 1,
    gap: theme.spacing[4],
  },
  iconWrapper: {
    width: 52,
    height: 52,
    borderRadius: theme.radii.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 2,
  },
  cardDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  formatsNote: {
    fontSize: 12,
    textAlign: "center",
  },
}));
