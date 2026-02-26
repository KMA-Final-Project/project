import { useState, useEffect, useCallback } from "react";
import { View, Text, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { OtpInput, Button, KeyboardAvoidingWrapper } from "@/components";
import { useAuthStore } from "@/stores/auth.store";

const RESEND_COOLDOWN = 60;

export default function VerifyOtpScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();

  const pendingEmail = useAuthStore((s) => s.pendingEmail);
  const verifyOtp = useAuthStore((s) => s.verifyOtp);

  const [otp, setOtp] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);

  // Countdown timer for resend
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleVerify = useCallback(async () => {
    if (!pendingEmail || otp.length < 6) return;
    setSubmitting(true);
    try {
      await verifyOtp({ email: pendingEmail, otp });
      router.replace("/");
    } catch (err: any) {
      const msg = err?.response?.data?.message || t("auth.errors.invalidOtp");
      Alert.alert(t("common.error"), msg);
    } finally {
      setSubmitting(false);
    }
  }, [pendingEmail, otp, verifyOtp, router, t]);

  const handleResend = useCallback(async () => {
    if (!pendingEmail || cooldown > 0) return;
    try {
      const { authApi } = await import("@/services");
      await authApi.register({
        email: pendingEmail,
        password: "resend-trigger",
        fullName: "",
      });
    } catch {
      // ignore — backend will resend OTP for existing pending registration
    }
    setCooldown(RESEND_COOLDOWN);
  }, [pendingEmail, cooldown]);

  // If no pending email, go back
  useEffect(() => {
    if (!pendingEmail) router.replace("/(auth)");
  }, [pendingEmail, router]);

  return (
    <KeyboardAvoidingWrapper>
      <View style={[styles.container, { paddingTop: insets.top + 60 }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{t("auth.verify.title")}</Text>
          <Text style={styles.subtitle}>
            {t("auth.verify.subtitle", { email: pendingEmail })}
          </Text>
        </View>

        <View style={styles.otpContainer}>
          <OtpInput value={otp} onChange={setOtp} />
        </View>

        <Button
          title={t("auth.verify.submit")}
          loading={submitting}
          disabled={submitting || otp.length < 6}
          onPress={handleVerify}
        />

        <Text
          style={[
            styles.resend,
            cooldown > 0 && { color: theme.colors.textSecondary },
          ]}
          onPress={cooldown <= 0 ? handleResend : undefined}
        >
          {cooldown > 0
            ? t("auth.verify.resendIn", { seconds: cooldown })
            : t("auth.verify.resend")}
        </Text>
      </View>
    </KeyboardAvoidingWrapper>
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
    marginBottom: theme.spacing[10],
  },
  title: {
    fontSize: theme.typography.sizes["2xl"],
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing[2],
  },
  subtitle: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
    textAlign: "center",
  },
  otpContainer: {
    marginBottom: theme.spacing[8],
  },
  resend: {
    textAlign: "center",
    marginTop: theme.spacing[6],
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.primary,
    fontWeight: theme.typography.weights.medium,
  },
}));
