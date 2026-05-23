import React from "react";
import { View, Text, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components";
import LogoImage from "../../../assets/logo/vertical_colored_blue.png";
import { ROUTES } from "@/constants/routes";

export default function WelcomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleGetStarted = () => {
    router.push(ROUTES.LOGIN);
  };

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
      {/* Center Branding Content */}
      <View style={styles.content}>
        <Image source={LogoImage} style={styles.logo} />
        <Text style={styles.tagline}>{t("welcome.tagline")}</Text>
        <Text style={styles.description}>{t("welcome.description")}</Text>
      </View>

      {/* Action Footer */}
      <View style={styles.footer}>
        <Button
          title={t("welcome.getStarted")}
          variant="primary"
          onPress={handleGetStarted}
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
    justifyContent: "space-between",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing[4],
  },
  logo: {
    width: 240,
    height: 240,
    resizeMode: "contain",
    marginBottom: theme.spacing[6],
  },
  tagline: {
    fontSize: theme.typography.sizes.xl,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.primary,
    textAlign: "center",
    marginBottom: theme.spacing[4],
  },
  description: {
    fontSize: theme.typography.sizes.base,
    color: theme.colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  footer: {
    width: "100%",
  },
}));
