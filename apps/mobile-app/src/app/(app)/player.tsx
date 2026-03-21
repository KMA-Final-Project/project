import React from "react";
import { View, Text, Pressable } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { ROUTES } from "@/constants/routes";

export default function PlayerPlaceholderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { theme } = useUnistyles();
  const { t } = useTranslation("processing");
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top + theme.spacing[4] }]}>
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() =>
            router.replace({
              pathname: ROUTES.PROCESSING,
              params: { id },
            } as any)
          }
        >
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          {t("playerPlaceholder.title")}
        </Text>
      </View>

      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <Ionicons
          name="play-circle-outline"
          size={44}
          color={theme.colors.primary}
        />
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
          {t("playerPlaceholder.heading")}
        </Text>
        <Text
          style={[
            styles.cardDescription,
            { color: theme.colors.textSecondary },
          ]}
        >
          {t("playerPlaceholder.description")}
        </Text>
        <Text
          style={[styles.mediaIdLabel, { color: theme.colors.textTertiary }]}
        >
          {t("playerPlaceholder.mediaId")}
        </Text>
        <Text style={[styles.mediaIdValue, { color: theme.colors.text }]}>
          {id ?? "-"}
        </Text>

        <Pressable
          style={[styles.button, { backgroundColor: theme.colors.primary }]}
          onPress={() =>
            router.replace({
              pathname: ROUTES.PROCESSING,
              params: { id },
            } as any)
          }
        >
          <Text
            style={[styles.buttonText, { color: theme.colors.textOnPrimary }]}
          >
            {t("playerPlaceholder.back")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingHorizontal: theme.spacing[5],
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    marginBottom: theme.spacing[6],
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
  },
  card: {
    borderWidth: 1,
    borderRadius: theme.radii.xl,
    padding: theme.spacing[6],
    alignItems: "center",
    gap: theme.spacing[3],
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  cardDescription: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
  },
  mediaIdLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: theme.spacing[2],
  },
  mediaIdValue: {
    fontSize: 13,
    fontWeight: "600",
  },
  button: {
    marginTop: theme.spacing[3],
    minWidth: 180,
    height: 48,
    borderRadius: theme.radii.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "700",
  },
}));
