import { useState, useCallback } from "react";
import { View, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { SegmentedControl } from "@/components";
import { LoginForm, RegisterForm } from "@/components/auth";

export default function AuthScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [tabIndex, setTabIndex] = useState(0);

  const segments = [t("auth.tabs.login"), t("auth.tabs.register")];

  const handleTabChange = useCallback((index: number) => {
    setTabIndex(index);
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 40 }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t("app.name")}</Text>
        <Text style={styles.tagline}>{t("auth.tagline")}</Text>
      </View>

      {/* Tabs */}
      <SegmentedControl
        segments={segments}
        selectedIndex={tabIndex}
        onChange={handleTabChange}
      />

      {/* Form */}
      <View style={styles.formContainer}>
        {tabIndex === 0 ? (
          <Animated.View
            key="login"
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(150)}
          >
            <LoginForm />
          </Animated.View>
        ) : (
          <Animated.View
            key="register"
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(150)}
          >
            <RegisterForm />
          </Animated.View>
        )}
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
    alignItems: "center",
    marginBottom: theme.spacing[8],
  },
  title: {
    fontSize: theme.typography.sizes["3xl"],
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.primary,
    marginBottom: theme.spacing[2],
  },
  tagline: {
    fontSize: theme.typography.sizes.base,
    color: theme.colors.textSecondary,
  },
  formContainer: {
    marginTop: theme.spacing[6],
  },
}));
