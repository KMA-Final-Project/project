/**
 * Settings Tab — Kapter
 *
 * Allows user to change theme, language, and log out.
 * Contains logic migrated from the old demo index screen.
 */
import { View, Text, Pressable, ScrollView } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { useThemePreference, useLanguagePreference } from "@/hooks";
import type { ThemePreference } from "@/hooks";
import type { SupportedLanguage } from "@/i18n";
import { Button, ScreenHeader } from "@/components";
import { useAuthStore } from "@/stores/auth.store";

export default function SettingsTab() {
  const { t } = useTranslation();
  const { preference, setThemePreference } = useThemePreference();
  const { currentLanguage, setLanguage } = useLanguagePreference();
  const logout = useAuthStore((s) => s.logout);

  const themeOptions: { key: ThemePreference; label: string }[] = [
    { key: "system", label: t("theme.system") },
    { key: "light", label: t("theme.light") },
    { key: "dark", label: t("theme.dark") },
  ];

  const languageOptions: { key: SupportedLanguage; label: string }[] = [
    { key: "en", label: t("language.en") },
    { key: "vi", label: t("language.vi") },
  ];

  return (
    <View style={styles.root}>
      <ScreenHeader title={t("common.settings")} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Theme Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Appearance</Text>
          <Text style={styles.currentValue}>Current: {preference}</Text>
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

        {/* Language Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Language</Text>
          <Text style={styles.currentValue}>
            Current: {t(`language.${currentLanguage}`)}
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

        <View style={styles.footer}>
          <Button
            title={t("auth.logout.title")}
            onPress={logout}
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
    paddingBottom: theme.spacing[10],
  },
  section: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radii.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[4],
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  sectionTitle: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.text,
    marginBottom: theme.spacing[2],
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
    paddingHorizontal: theme.spacing[4],
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
    marginTop: theme.spacing[8],
  },
}));
