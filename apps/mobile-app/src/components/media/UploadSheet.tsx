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
import type { UploadBlockerCode } from "@/types/subscription";

interface UploadSheetProps {
  onSelectDevice: () => void;
  onSelectYouTube: () => void;
  onViewPlans: () => void;
  remainingMinutes: number | null;
  totalMinutes: number | null;
  currentPlanName?: string | null;
  blockerCode?: UploadBlockerCode;
  isLoading?: boolean;
  disabled?: boolean;
}

export function UploadSheet({
  onSelectDevice,
  onSelectYouTube,
  onViewPlans,
  remainingMinutes,
  totalMinutes,
  currentPlanName,
  blockerCode = "none",
  isLoading = false,
  disabled = false,
}: UploadSheetProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const isBlocked = blockerCode !== "none";
  const effectiveDisabled = disabled || isBlocked;
  const quotaSummary =
    remainingMinutes == null || totalMinutes == null
      ? t("upload.quotaRemainingUnknown")
      : t(
          "upload.quotaRemaining",
          "Remaining quota: {{remaining}}/{{total}} mins",
          {
            remaining: remainingMinutes,
            total: totalMinutes,
          },
        );

  return (
    <View style={styles.container}>
      {/* Header */}
      <Text style={[styles.title, { color: theme.colors.text }]}>
        {t("upload.title")}
      </Text>
      <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
        {t("upload.subtitle")}
      </Text>

      {isBlocked ? (
        <View
          style={[
            styles.blockerCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View style={styles.blockerHeader}>
            <Ionicons
              name="alert-circle-outline"
              size={18}
              color={theme.colors.primary}
            />
            <Text style={[styles.blockerTitle, { color: theme.colors.text }]}>
              {t("upload.blockedTitle")}
            </Text>
          </View>
          <Text
            style={[styles.blockerMessage, { color: theme.colors.textSecondary }]}
          >
            {blockerCode === "subscriptionInactive"
              ? t("upload.blockedSubscriptionInactive")
              : t("upload.blockedQuotaExceeded")}
          </Text>
          <Pressable
            style={[
              styles.viewPlansButton,
              { backgroundColor: theme.colors.primary },
            ]}
            onPress={onViewPlans}
          >
            <Text
              style={[
                styles.viewPlansButtonText,
                { color: theme.colors.textOnPrimary },
              ]}
            >
              {t("upload.viewPlans")}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.quotaContainer}>
          <Ionicons
            name="time-outline"
            size={16}
            color={theme.colors.primary}
          />
          <View style={styles.quotaCopy}>
            <Text
              style={[styles.quotaText, { color: theme.colors.textSecondary }]}
            >
              {isLoading ? t("common.loading") : quotaSummary}
            </Text>
            {currentPlanName ? (
              <Text
                style={[
                  styles.planLabel,
                  { color: theme.colors.textTertiary },
                ]}
              >
                {t("upload.currentPlan", { plan: currentPlanName })}
              </Text>
            ) : null}
          </View>
        </View>
      )}

      {/* Option Cards */}
      <View style={styles.cards}>
        {/* From Device */}
        <Pressable
          style={({ pressed }) => [
            styles.card,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
              opacity: pressed || effectiveDisabled ? 0.7 : 1,
            },
          ]}
          onPress={onSelectDevice}
          disabled={effectiveDisabled}
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
              opacity: pressed || effectiveDisabled ? 0.7 : 1,
            },
          ]}
          onPress={onSelectYouTube}
          disabled={effectiveDisabled}
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
    marginBottom: theme.spacing[3],
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
  quotaContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginBottom: theme.spacing[4],
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.radii.md,
  },
  quotaCopy: {
    flex: 1,
  },
  quotaText: {
    fontSize: 12,
    fontWeight: theme.typography.weights.medium,
  },
  planLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  blockerCard: {
    borderWidth: 1,
    borderRadius: theme.radii.xl,
    padding: theme.spacing[4],
    gap: theme.spacing[3],
    marginBottom: theme.spacing[4],
  },
  blockerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  blockerTitle: {
    fontSize: 15,
    fontWeight: theme.typography.weights.bold,
  },
  blockerMessage: {
    fontSize: 13,
    lineHeight: 19,
  },
  viewPlansButton: {
    alignSelf: "flex-start",
    borderRadius: theme.radii.lg,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  viewPlansButtonText: {
    fontSize: 13,
    fontWeight: theme.typography.weights.semibold,
  },
}));
