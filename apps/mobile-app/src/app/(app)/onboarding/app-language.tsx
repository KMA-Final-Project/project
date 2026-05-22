import React from "react";
import { View, Text, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { StyleSheet } from "react-native-unistyles";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "@/components";
import { useLanguagePreference } from "@/hooks";
import { ROUTES } from "@/constants/routes";

export default function AppLanguageScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { currentLanguage, setLanguage } = useLanguagePreference();

  const handleNext = () => {
    router.push(ROUTES.ONBOARDING_TARGET_LANG as any);
  };

  const languages = [
    { key: "vi", label: t("language.vi"), subtitle: "Giao diện Tiếng Việt" },
    { key: "en", label: t("language.en"), subtitle: "English Interface" },
  ] as const;

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top + 40,
          paddingBottom: Math.max(insets.bottom + 20, 40),
        },
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{t("onboarding.appLanguage.title")}</Text>
        <Text style={styles.subtitle}>{t("onboarding.appLanguage.subtitle")}</Text>
      </View>

      <View style={styles.content}>
        {languages.map((lang) => {
          const isSelected = currentLanguage === lang.key;
          return (
            <Pressable
              key={lang.key}
              style={[styles.card, isSelected && styles.cardActive]}
              onPress={() => setLanguage(lang.key)}
            >
              <View style={styles.cardContent}>
                <Text style={[styles.cardLabel, isSelected && styles.cardLabelActive]}>
                  {lang.label}
                </Text>
                <Text style={styles.cardSub}>{lang.subtitle}</Text>
              </View>
              {isSelected ? (
                <Ionicons name="checkmark-circle" size={24} color={styles.activeColor.color} />
              ) : (
                <View style={styles.circlePlaceholder} />
              )}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.footer}>
        <Button title={t("common.next")} variant="primary" onPress={handleNext} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingHorizontal: theme.spacing[6],
  },
  header: {
    marginBottom: theme.spacing[8],
  },
  title: {
    fontSize: theme.typography.sizes["2xl"],
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing[2],
  },
  subtitle: {
    fontSize: theme.typography.sizes.base,
    color: theme.colors.textSecondary,
    lineHeight: 22,
  },
  content: {
    flex: 1,
    gap: theme.spacing[4],
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: theme.spacing[5],
    borderRadius: theme.radii.lg,
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
  },
  cardActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + "14",
  },
  cardContent: {
    flex: 1,
  },
  cardLabel: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.text,
    marginBottom: theme.spacing[1],
  },
  cardLabelActive: {
    color: theme.colors.primary,
  },
  cardSub: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
  },
  circlePlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  footer: {
    marginTop: "auto",
  },
  activeColor: {
    color: theme.colors.primary,
  },
}));
