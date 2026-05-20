import { useState, useEffect, useCallback } from "react";
import { View, Text, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { OtpInput, Button, KeyboardAvoidingWrapper } from "@/components";
import { useAuthStore } from "@/stores/auth.store";
import { authApi } from "@/services/auth.services";

import { extractApiError } from "@/utils/api-error";
import { ROUTES } from "@/constants/routes";

const RESEND_COOLDOWN = 60;

export default function VerifyOtpScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();

  const pendingEmail = useAuthStore((s) => s.pendingEmail);
  const verifyOtp = useAuthStore((s) => s.verifyOtp);
  const otpCooldownUntil = useAuthStore((s) => s.otpCooldownUntil);
  const setOtpCooldownUntil = useAuthStore((s) => s.setOtpCooldownUntil);

  const [otp, setOtp] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const calculateRemaining = useCallback(() => {
    if (!otpCooldownUntil) return 0;
    return Math.max(0, Math.ceil((otpCooldownUntil - Date.now()) / 1000));
  }, [otpCooldownUntil]);

  const [cooldown, setCooldown] = useState(calculateRemaining());

  // Initialize cooldown if none exists
  useEffect(() => {
    if (otpCooldownUntil === null && pendingEmail) {
      setOtpCooldownUntil(Date.now() + RESEND_COOLDOWN * 1000);
    }
  }, [otpCooldownUntil, pendingEmail, setOtpCooldownUntil]);

  // Interval for countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setCooldown(calculateRemaining());
    }, 1000);
    return () => clearInterval(timer);
  }, [calculateRemaining]);

  const handleVerify = useCallback(async () => {
    if (!pendingEmail || otp.length < 6) return;
    setSubmitting(true);
    try {
      await verifyOtp({ email: pendingEmail, otp });
      router.replace("/");
    } catch (err) {
      const msg = extractApiError(err);
      Alert.alert(t("common.error"), msg);
    } finally {
      setSubmitting(false);
    }
  }, [pendingEmail, otp, verifyOtp, router, t]);

  const handleResend = useCallback(async () => {
    if (!pendingEmail || cooldown > 0) return;
    try {
      await authApi.resendOtp(pendingEmail);
      setOtpCooldownUntil(Date.now() + RESEND_COOLDOWN * 1000);
    } catch (err) {
      const msg = extractApiError(err);
      Alert.alert(t("common.error"), msg);
    }
  }, [pendingEmail, cooldown, setOtpCooldownUntil, t]);

  useEffect(() => {
    if (!pendingEmail) router.replace(ROUTES.AUTH as any);
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
