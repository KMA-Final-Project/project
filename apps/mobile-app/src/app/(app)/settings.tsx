/**
 * Settings Tab — Kapter
 *
 * Allows user to change theme, application interface language, default translation target language,
 * and view their subscription usage/quota. Includes log out and app state reset.
 */
import React from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import {
  useThemePreference,
  useLanguagePreference,
  useOnboarding,
  useSubscriptionStatus,
} from "@/hooks";
import type { ThemePreference } from "@/hooks";
import type { SupportedLanguage } from "@/i18n";
import { Button, ScreenHeader } from "@/components";
import { ROUTES } from "@/constants/routes";
import { useAuthStore } from "@/stores/auth.store";
import { Ionicons } from "@expo/vector-icons";

export default function SettingsTab() {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const router = useRouter();
  const { preference, setThemePreference } = useThemePreference();
  const { currentLanguage, setLanguage } = useLanguagePreference();
  const { defaultTargetLanguage, setTargetLanguage, resetOnboarding } = useOnboarding();
  const { data: subscriptionStatus, isLoading: quotaLoading } =
    useSubscriptionStatus();
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = async () => {
    await resetOnboarding();
    logout();
  };

  const themeOptions: { key: ThemePreference; label: string }[] = [
    { key: "system", label: t("theme.system") },
    { key: "light", label: t("theme.light") },
    { key: "dark", label: t("theme.dark") },
  ];

  const languageOptions: { key: SupportedLanguage; label: string }[] = [
    { key: "en", label: t("language.en") },
    { key: "vi", label: t("language.vi") },
  ];

  const targetLangOptions = [
    { key: "en", label: t("language.en") },
    { key: "vi", label: t("language.vi") },
  ];

  const remaining = subscriptionStatus?.quota.remainingSeconds == null
    ? null
    : Math.max(0, Math.floor(subscriptionStatus.quota.remainingSeconds / 60));
  const total = subscriptionStatus?.quota.totalSeconds == null
    ? null
    : Math.max(1, Math.floor(subscriptionStatus.quota.totalSeconds / 60));
  const percent =
    remaining == null || total == null
      ? 0
      : Math.min(100, Math.max(0, (remaining / total) * 100));

  return (
    <View style={styles.root}>
      <ScreenHeader title={t("common.settings")} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Subscription Quota Card */}
        <Pressable
          onPress={() => router.push(ROUTES.SUBSCRIPTION as never)}
          style={({ pressed }) => [
            styles.section,
            pressed && styles.linkRowPressed,
          ]}
        >
          <View style={styles.sectionHeader}>
            <Ionicons name="sparkles" size={20} color={theme.colors.primary} />
            <Text style={styles.sectionTitle}>{t("settings.quotaTitle")}</Text>
          </View>

          {quotaLoading ? (
            <ActivityIndicator size="small" color={theme.colors.primary} style={styles.loader} />
          ) : (
            <View style={styles.quotaBody}>
              <View style={styles.quotaRow}>
                <Text style={styles.quotaMinutes}>
                  {remaining == null || total == null
                    ? t("settings.quotaUnlimited")
                    : t("settings.quotaMinutes", {
                        remaining,
                        total,
                      })}
                </Text>
                {remaining != null && total != null ? (
                  <Text style={styles.quotaPercent}>{Math.round(percent)}%</Text>
                ) : null}
              </View>
              {remaining != null && total != null ? (
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${percent}%` }]} />
                </View>
              ) : null}
              {subscriptionStatus?.currentPlan?.planName ? (
                <Text style={styles.quotaResetText}>
                  {t("settings.currentPlanLabel", {
                    plan: subscriptionStatus.currentPlan.planName,
                  })}
                </Text>
              ) : null}
              <Text style={styles.quotaResetText}>
                {t("settings.aiCreditsSummary", {
                  remaining: subscriptionStatus?.aiCredits.remaining ?? 0,
                  total: subscriptionStatus?.aiCredits.includedPerCycle ?? 0,
                })}
              </Text>
            </View>
          )}
        </Pressable>

        {/* Translation Default Target Language Section */}
        <View style={styles.section}>
          <Pressable
            onPress={() => router.push(ROUTES.WORD_BANK as never)}
            style={({ pressed }) => [styles.linkRow, pressed && styles.linkRowPressed]}
          >
            <View style={styles.linkRowIdentity}>
              <View
                style={[
                  styles.linkIcon,
                  { backgroundColor: theme.colors.surface },
                ]}
              >
                <Ionicons
                  name="bookmark-outline"
                  size={18}
                  color={theme.colors.primary}
                />
              </View>
              <View style={styles.linkTextBlock}>
                <Text style={styles.sectionTitle}>{t("wordBank.settingsEntry")}</Text>
                <Text style={styles.linkHint}>{t("wordBank.settingsHint")}</Text>
              </View>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={theme.colors.textSecondary}
            />
          </Pressable>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="language" size={20} color={theme.colors.primary} />
            <Text style={styles.sectionTitle}>{t("settings.targetLanguage")}</Text>
          </View>
          <Text style={styles.currentValue}>
            {t("settings.current", { value: t(`language.${defaultTargetLanguage}` as any) })}
          </Text>
          <View style={styles.buttonGroup}>
            {targetLangOptions.map(({ key, label }) => (
              <Pressable
                key={key}
                style={[
                  styles.button,
                  defaultTargetLanguage === key && styles.buttonActive,
                ]}
                onPress={() => setTargetLanguage(key)}
              >
                <Text
                  style={[
                    styles.buttonText,
                    defaultTargetLanguage === key && styles.buttonTextActive,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* App Interface Language Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="globe-outline" size={20} color={theme.colors.primary} />
            <Text style={styles.sectionTitle}>{t("settings.interfaceLanguage")}</Text>
          </View>
          <Text style={styles.currentValue}>
            {t("settings.current", { value: t(`language.${currentLanguage}` as any) })}
          </Text>
          <View style={styles.buttonGroup}>
            {languageOptions.map(({ key, label }) => (
              <Pressable
                key={key}
                style={[
                  styles.button,
                  currentLanguage === key && styles.buttonActive,
                ]}
                onPress={() => setLanguage(key)}
              >
                <Text
                  style={[
                    styles.buttonText,
                    currentLanguage === key && styles.buttonTextActive,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Theme Appearance Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="color-wand-outline" size={20} color={theme.colors.primary} />
            <Text style={styles.sectionTitle}>{t("settings.appearance")}</Text>
          </View>
          <Text style={styles.currentValue}>
            {t("settings.current", { value: t(`theme.${preference}` as any) })}
          </Text>
          <View style={styles.buttonGroup}>
            {themeOptions.map(({ key, label }) => (
              <Pressable
                key={key}
                style={[
                  styles.button,
                  preference === key && styles.buttonActive,
                ]}
                onPress={() => setThemePreference(key)}
              >
                <Text
                  style={[
                    styles.buttonText,
                    preference === key && styles.buttonTextActive,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.footer}>
          <Button
            title={t("auth.logout.title")}
            onPress={handleLogout}
            variant="secondary"
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[4],
    paddingBottom: 120, // Increased bottom padding to clear floating tab bar
  },
  section: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radii.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[4],
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  linkRowPressed: {
    opacity: 0.88,
  },
  linkRowIdentity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  linkIcon: {
    width: 40,
    height: 40,
    borderRadius: theme.radii.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  linkTextBlock: {
    flex: 1,
    gap: 2,
  },
  linkHint: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textTertiary,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    marginBottom: theme.spacing[3],
  },
  sectionTitle: {
    fontSize: theme.typography.sizes.base,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
  },
  loader: {
    paddingVertical: theme.spacing[4],
  },
  quotaBody: {
    marginTop: theme.spacing[1],
  },
  quotaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing[2],
  },
  quotaMinutes: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
  },
  quotaPercent: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.weights.semibold,
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.border,
    width: "100%",
    overflow: "hidden",
    marginBottom: theme.spacing[3],
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: theme.colors.primary,
  },
  quotaResetText: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.textTertiary,
  },
  currentValue: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[4],
  },
  buttonGroup: {
    flexDirection: "row",
    gap: theme.spacing[3],
  },
  button: {
    flex: 1,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: "center",
  },
  buttonActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  buttonText: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.text,
  },
  buttonTextActive: {
    color: theme.colors.textOnPrimary,
  },
  footer: {
    marginTop: theme.spacing[6],
  },
}));
