/**
 * Demo Home Screen — Kapter
 *
 * Demonstrates theming (light/dark/system) and i18n (en/vi) switching.
 * This is a temporary verification screen — will be replaced with actual app screens.
 */
import { View, Text, Pressable, ScrollView } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { useThemePreference, useLanguagePreference } from "@/hooks";
import type { ThemePreference } from "@/hooks";
import type { SupportedLanguage } from "@/i18n";
import { Button } from "@/components";
import { useAuthStore } from "@/stores/auth.store";

export default function Index() {
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
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>
            {t("demo.title", { appName: t("app.name") })}
          </Text>
          <Text style={styles.subtitle}>{t("demo.subtitle")}</Text>
        </View>

        {/* Theme Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("demo.themeSection")}</Text>
          <Text style={styles.currentValue}>
            {t("demo.currentTheme", { theme: preference })}
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

        {/* Language Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("demo.languageSection")}</Text>
          <Text style={styles.currentValue}>
            {t("demo.currentLanguage", {
              language: t(`language.${currentLanguage}`),
            })}
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

        {/* Color Palette Preview */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Color Palette</Text>
          <View style={styles.colorGrid}>
            <View style={styles.colorSwatch}>
              <View style={[styles.colorBox, styles.primaryColor]} />
              <Text style={styles.colorLabel}>Primary</Text>
            </View>
            <View style={styles.colorSwatch}>
              <View style={[styles.colorBox, styles.secondaryColor]} />
              <Text style={styles.colorLabel}>Secondary</Text>
            </View>
            <View style={styles.colorSwatch}>
              <View style={[styles.colorBox, styles.successColor]} />
              <Text style={styles.colorLabel}>Success</Text>
            </View>
            <View style={styles.colorSwatch}>
              <View style={[styles.colorBox, styles.errorColor]} />
              <Text style={styles.colorLabel}>Error</Text>
            </View>
            <View style={styles.colorSwatch}>
              <View style={[styles.colorBox, styles.warningColor]} />
              <Text style={styles.colorLabel}>Warning</Text>
            </View>
            <View style={styles.colorSwatch}>
              <View style={[styles.colorBox, styles.infoColor]} />
              <Text style={styles.colorLabel}>Info</Text>
            </View>
          </View>
        </View>

        {/* Logout button */}
        <Button title={t("auth.logout.title")} onPress={logout} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  scrollContent: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingHorizontal: theme.spacing[5],
    paddingTop: theme.spacing[16],
    paddingBottom: theme.spacing[10],
  },
  header: {
    marginBottom: theme.spacing[8],
    alignItems: "center",
  },
  title: {
    fontSize: theme.typography.sizes["3xl"],
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
    textAlign: "center",
    marginBottom: theme.spacing[2],
  },
  subtitle: {
    fontSize: theme.typography.sizes.lg,
    color: theme.colors.textSecondary,
    textAlign: "center",
  },
  section: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radii.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[5],
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  sectionTitle: {
    fontSize: theme.typography.sizes.xl,
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
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[3],
  },
  colorSwatch: {
    alignItems: "center",
    width: 72,
  },
  colorBox: {
    width: 48,
    height: 48,
    borderRadius: theme.radii.md,
    marginBottom: theme.spacing[1],
  },
  colorLabel: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.textSecondary,
  },
  primaryColor: {
    backgroundColor: theme.colors.primary,
  },
  secondaryColor: {
    backgroundColor: theme.colors.secondary,
  },
  successColor: {
    backgroundColor: theme.colors.success,
  },
  errorColor: {
    backgroundColor: theme.colors.error,
  },
  warningColor: {
    backgroundColor: theme.colors.warning,
  },
  infoColor: {
    backgroundColor: theme.colors.info,
  },
}));
