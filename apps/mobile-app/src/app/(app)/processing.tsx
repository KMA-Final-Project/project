/**
 * Processing Status Screen — Kapter
 *
 * Tracks the bilingual subtitle generation pipeline in real time via polling.
 * Navigated to immediately after a successful upload or YouTube submission.
 *
 * States handled:
 *   QUEUED      → "Waiting to start..." with spinner
 *   PROCESSING  → Circular ring + live pipeline stepper
 *   COMPLETED   → "Subtitles Ready!" card + "Open Player" CTA
 *   FAILED      → Error message + "Back to Library"
 */
import React from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle } from "react-native-svg";
import { useTranslation } from "react-i18next";

import { useMediaStatus } from "@/hooks/useMedia";
import { PipelineStepper } from "@/components/media/PipelineStepper";
import { ROUTES } from "@/constants/routes";
import type { MediaStatus } from "@/types/media";

// ─── Helpers ─────────────────────────────────────────────────────

function formatEta(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "";
  if (seconds < 60) return `~${Math.round(seconds)}s`;
  const mins = Math.ceil(seconds / 60);
  return `~${mins} min`;
}

function getStatusLabel(status: MediaStatus | undefined, t: any): string {
  if (!status || status === "QUEUED" || status === "VALIDATING")
    return t("status.queued");
  if (status === "PROCESSING") return t("status.processing");
  if (status === "COMPLETED") return t("status.completed");
  if (status === "FAILED") return t("status.failed");
  return "";
}

// ─── Circular Progress Ring (SVG) ────────────────────────────────

function CircularProgressRing({
  progress,
  size = 160,
  strokeWidth = 10,
  color,
  trackColor,
}: {
  progress: number; // 0.0 – 1.0
  size?: number;
  strokeWidth?: number;
  color: string;
  trackColor: string;
}) {
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.min(1, Math.max(0, progress)));

  return (
    <Svg
      width={size}
      height={size}
      style={{ transform: [{ rotate: "-90deg" }] }}
    >
      <Circle
        cx={cx}
        cy={cx}
        r={r}
        stroke={trackColor}
        strokeWidth={strokeWidth}
        fill="transparent"
      />
      <Circle
        cx={cx}
        cy={cx}
        r={r}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="transparent"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────

export default function ProcessingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { theme } = useUnistyles();
  const { t } = useTranslation("processing");

  const insets = useSafeAreaInsets();

  const { data: media, isLoading } = useMediaStatus(id ?? null);

  const goToLibrary = () => router.replace("/");
  const goToPlayer = () =>
    router.replace({ pathname: ROUTES.PLAYER, params: { id } } as any);

  const progress = media?.progress ?? 0;
  const status = media?.status;
  const isDone = status === "COMPLETED";
  const isFailed = status === "FAILED";

  // ── Loading skeleton ──────────────────────────────────────────
  if (isLoading && !media) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Top bar ─────────────────────────────────────────── */}
      <View style={styles.topBar}>
        <Pressable style={styles.backBtn} onPress={goToLibrary} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </Pressable>
        <Text style={[styles.screenTitle, { color: theme.colors.text }]}>
          {t("title")}
        </Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Progress Ring + Status Text ───────────────────── */}
        <View style={styles.ringSection}>
          <View style={styles.ringWrapper}>
            <CircularProgressRing
              progress={isDone ? 1 : progress}
              size={160}
              strokeWidth={10}
              color={
                isFailed
                  ? theme.colors.error
                  : isDone
                    ? theme.colors.success
                    : theme.colors.primary
              }
              trackColor={theme.colors.surface}
            />

            {/* Centre label */}
            <View style={styles.ringCenter}>
              {isDone ? (
                <Ionicons
                  name="checkmark-circle"
                  size={48}
                  color={theme.colors.success}
                />
              ) : isFailed ? (
                <Ionicons
                  name="close-circle"
                  size={48}
                  color={theme.colors.error}
                />
              ) : (
                <>
                  <Text
                    style={[styles.ringPercent, { color: theme.colors.text }]}
                  >
                    {Math.round(progress * 100)}%
                  </Text>
                  <Text
                    style={[
                      styles.ringLabel,
                      { color: theme.colors.textSecondary },
                    ]}
                  >
                    {t("progress")}
                  </Text>
                </>
              )}
            </View>
          </View>

          {/* Status text */}
          <Text
            style={[
              styles.statusText,
              {
                color: isFailed
                  ? theme.colors.error
                  : isDone
                    ? theme.colors.success
                    : theme.colors.primary,
              },
            ]}
          >
            {getStatusLabel(status, t)}
          </Text>

          {/* Media title card */}
          {media && (
            <View
              style={[
                styles.mediaCard,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <View
                style={[
                  styles.mediaIcon,
                  { backgroundColor: theme.colors.primary + "18" },
                ]}
              >
                <Ionicons
                  name={
                    media.originType === "YOUTUBE"
                      ? "logo-youtube"
                      : "musical-note"
                  }
                  size={24}
                  color={
                    media.originType === "YOUTUBE"
                      ? "#EF4444"
                      : theme.colors.primary
                  }
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.mediaTitle, { color: theme.colors.text }]}
                  numberOfLines={2}
                >
                  {media.title ?? t("untitled")}
                </Text>
                {media.durationSeconds && (
                  <Text
                    style={[
                      styles.mediaMeta,
                      { color: theme.colors.textSecondary },
                    ]}
                  >
                    {Math.floor(media.durationSeconds / 60)}:
                    {(Math.round(media.durationSeconds % 60) < 10 ? "0" : "") +
                      Math.round(media.durationSeconds % 60)}{" "}
                    •{" "}
                    {media.originType === "YOUTUBE"
                      ? t("originYoutube")
                      : t("originLocal")}
                  </Text>
                )}
              </View>
            </View>
          )}
        </View>

        {/* ── Pipeline Stepper (hide on completed for cleaner look) ── */}
        {!isFailed && (
          <View
            style={[
              styles.stepperSection,
              { borderTopColor: theme.colors.border },
            ]}
          >
            <PipelineStepper
              currentStep={isDone ? "EXPORTING" : (media?.currentStep ?? null)}
              status={status ?? "QUEUED"}
            />
          </View>
        )}

        {/* ── Failed reason ────────────────────────────────────── */}
        {isFailed && media?.failReason && (
          <View
            style={[
              styles.errorCard,
              {
                backgroundColor: theme.colors.error + "15",
                borderColor: theme.colors.error + "40",
              },
            ]}
          >
            <Ionicons
              name="warning-outline"
              size={18}
              color={theme.colors.error}
            />
            <Text style={[styles.errorText, { color: theme.colors.error }]}>
              {media.failReason}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* ── Bottom Actions ───────────────────────────────────── */}
      <View
        style={[
          styles.footer,
          {
            borderTopColor: theme.colors.border,
            paddingBottom: insets.bottom + 12,
            backgroundColor: theme.colors.background,
          },
        ]}
      >
        {isDone ? (
          <>
            <Pressable
              style={[
                styles.btnPrimary,
                { backgroundColor: theme.colors.primary },
              ]}
              onPress={goToPlayer}
            >
              <Ionicons
                name="play-circle"
                size={20}
                color="#fff"
                style={{ marginRight: 8 }}
              />
              <Text style={styles.btnPrimaryText}>{t("openPlayer")}</Text>
            </Pressable>
            <Pressable
              style={[
                styles.btnSecondary,
                { borderColor: theme.colors.border },
              ]}
              onPress={goToLibrary}
            >
              <Text
                style={[
                  styles.btnSecondaryText,
                  { color: theme.colors.textSecondary },
                ]}
              >
                {t("backLibrary")}
              </Text>
            </Pressable>
          </>
        ) : isFailed ? (
          <Pressable
            style={[
              styles.btnPrimary,
              { backgroundColor: theme.colors.border },
            ]}
            onPress={goToLibrary}
          >
            <Text style={[styles.btnPrimaryText, { color: theme.colors.text }]}>
              {t("backLibrary")}
            </Text>
          </Pressable>
        ) : (
          <>
            {media?.estimatedTimeRemaining != null && (
              <Text
                style={[styles.etaText, { color: theme.colors.textSecondary }]}
              >
                {t("eta")}
                <Text style={{ color: theme.colors.text, fontWeight: "600" }}>
                  {formatEta(media.estimatedTimeRemaining)}
                </Text>
              </Text>
            )}
            <Pressable
              style={[
                styles.btnSecondary,
                { borderColor: theme.colors.primary, borderWidth: 2 },
              ]}
              onPress={goToLibrary}
            >
              <Text
                style={[
                  styles.btnSecondaryText,
                  { color: theme.colors.primary, fontWeight: "700" },
                ]}
              >
                {t("runBackground")}
              </Text>
            </Pressable>
            <View style={styles.notificationHint}>
              <Ionicons
                name="notifications-outline"
                size={14}
                color={theme.colors.textTertiary}
              />
              <Text
                style={[
                  styles.notificationText,
                  { color: theme.colors.textTertiary },
                ]}
              >
                {t("notificationHint")}
              </Text>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  center: {
    justifyContent: "center",
    alignItems: "center",
  },
  // ── Top bar
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  screenTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
  },
  // ── Scroll content
  scrollContent: {
    paddingBottom: theme.spacing[4],
  },
  // ── Ring section
  ringSection: {
    alignItems: "center",
    paddingHorizontal: theme.spacing[6],
    paddingTop: theme.spacing[4],
    paddingBottom: theme.spacing[6],
    gap: theme.spacing[4],
  },
  ringWrapper: {
    position: "relative",
    width: 160,
    height: 160,
    alignItems: "center",
    justifyContent: "center",
  },
  ringCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  ringPercent: {
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: -1,
  },
  ringLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: 2,
  },
  statusText: {
    fontSize: 17,
    fontWeight: "600",
  },
  // ── Media card
  mediaCard: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[4],
    padding: theme.spacing[4],
    borderRadius: theme.radii.xl,
    borderWidth: 1,
  },
  mediaIcon: {
    width: 48,
    height: 48,
    borderRadius: theme.radii.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  mediaTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  mediaMeta: {
    fontSize: 12,
    marginTop: 3,
  },
  // ── Stepper
  stepperSection: {
    paddingHorizontal: theme.spacing[6],
    paddingTop: theme.spacing[5],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  // ── Error card
  errorCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[2],
    marginHorizontal: theme.spacing[6],
    marginTop: theme.spacing[4],
    padding: theme.spacing[4],
    borderRadius: theme.radii.lg,
    borderWidth: 1,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  // ── Footer
  footer: {
    padding: theme.spacing[5],
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: theme.spacing[3],
  },
  etaText: {
    textAlign: "center",
    fontSize: 14,
  },
  btnPrimary: {
    height: 52,
    borderRadius: theme.radii.xl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimaryText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  btnSecondary: {
    height: 52,
    borderRadius: theme.radii.xl,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  btnSecondaryText: {
    fontSize: 15,
    fontWeight: "600",
  },
  notificationHint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[1],
  },
  notificationText: {
    fontSize: 12,
  },
}));
