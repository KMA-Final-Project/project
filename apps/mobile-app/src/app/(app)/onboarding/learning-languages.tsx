import React from "react";
import { View, Text, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { StyleSheet } from "react-native-unistyles";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "@/components";
import { useOnboarding } from "@/hooks";
import { ROUTES } from "@/constants/routes";

export default function LearningLanguagesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { learningLanguages, setLearningLangs, completeOnboarding } = useOnboarding();

  const toggleLanguage = (langKey: string) => {
    if (learningLanguages.includes(langKey)) {
      setLearningLangs(learningLanguages.filter((l) => l !== langKey));
    } else {
      setLearningLangs([...learningLanguages, langKey]);
    }
  };

  const handleFinish = async () => {
    await completeOnboarding();
    router.replace(ROUTES.HOME);
  };

  const handleBack = () => {
    router.back();
  };

  const languages = [
    { key: "en", label: "English", flag: "🇬🇧" },
    { key: "vi", label: "Tiếng Việt", flag: "🇻🇳" },
    { key: "ko", label: "한국어 (Korean)", flag: "🇰🇷" },
    { key: "ja", label: "日本語 (Japanese)", flag: "🇯🇵" },
    { key: "zh", label: "中文 (Chinese)", flag: "🇨🇳" },
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
        <Text style={styles.title}>{t("onboarding.learningLanguages.title")}</Text>
        <Text style={styles.subtitle}>{t("onboarding.learningLanguages.subtitle")}</Text>
      </View>

      <View style={styles.content}>
        {languages.map((lang) => {
          const isSelected = learningLanguages.includes(lang.key);
          return (
            <Pressable
              key={lang.key}
              style={[styles.card, isSelected && styles.cardActive]}
              onPress={() => toggleLanguage(lang.key)}
            >
              <View style={styles.cardContent}>
                <Text style={styles.flag}>{lang.flag}</Text>
                <Text style={[styles.cardLabel, isSelected && styles.cardLabelActive]}>
                  {lang.label}
                </Text>
              </View>
              {isSelected ? (
                <Ionicons name="checkbox" size={24} color={styles.activeColor.color} />
              ) : (
                <Ionicons name="square-outline" size={24} color={styles.inactiveColor.color} />
              )}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.footer}>
        <Button
          title={t("common.back")}
          variant="secondary"
          onPress={handleBack}
          style={styles.backButton}
        />
        <Button
          title={t("onboarding.learningLanguages.done")}
          variant="primary"
          onPress={handleFinish}
          style={styles.finishButton}
        />
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
    gap: theme.spacing[3],
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: theme.spacing[4],
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
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  flag: {
    fontSize: theme.typography.sizes.xl,
  },
  cardLabel: {
    fontSize: theme.typography.sizes.base,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.text,
  },
  cardLabelActive: {
    color: theme.colors.primary,
  },
  footer: {
    flexDirection: "row",
    gap: theme.spacing[3],
    marginTop: "auto",
  },
  backButton: {
    flex: 1,
  },
  finishButton: {
    flex: 1,
  },
  activeColor: {
    color: theme.colors.primary,
  },
  inactiveColor: {
    color: theme.colors.border,
  },
}));
