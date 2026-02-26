import { useState } from "react";
import { View, Alert } from "react-native";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { StyleSheet } from "react-native-unistyles";
import { TextInput, Button } from "@/components";
import { registerSchema, type RegisterFormData } from "@/validations/auth";
import { useAuthStore } from "@/stores/auth.store";

export function RegisterForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const register = useAuthStore((s) => s.register);
  const setPendingEmail = useAuthStore((s) => s.setPendingEmail);
  const [submitting, setSubmitting] = useState(false);

  const { control, handleSubmit } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (data: RegisterFormData) => {
    setSubmitting(true);
    try {
      await register({
        fullName: data.fullName,
        email: data.email,
        password: data.password,
      });
      setPendingEmail(data.email);
      router.push("/(auth)/verify-otp");
    } catch (err: any) {
      const msg = err?.response?.data?.message || t("auth.errors.generic");
      Alert.alert(t("common.error"), msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Controller
        control={control}
        name="fullName"
        render={({ field: { onChange, onBlur, value }, fieldState }) => (
          <TextInput
            label={t("auth.register.fullName")}
            placeholder="John Doe"
            autoCapitalize="words"
            autoComplete="name"
            value={value}
            onBlur={onBlur}
            onChangeText={onChange}
            error={fieldState.error?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="email"
        render={({ field: { onChange, onBlur, value }, fieldState }) => (
          <TextInput
            label={t("auth.register.email")}
            placeholder="hello@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            value={value}
            onBlur={onBlur}
            onChangeText={onChange}
            error={fieldState.error?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, onBlur, value }, fieldState }) => (
          <TextInput
            label={t("auth.register.password")}
            placeholder="••••••••"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            value={value}
            onBlur={onBlur}
            onChangeText={onChange}
            error={fieldState.error?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="confirmPassword"
        render={({ field: { onChange, onBlur, value }, fieldState }) => (
          <TextInput
            label={t("auth.register.confirmPassword")}
            placeholder="••••••••"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            value={value}
            onBlur={onBlur}
            onChangeText={onChange}
            error={fieldState.error?.message}
          />
        )}
      />

      <Button
        title={t("auth.register.submit")}
        loading={submitting}
        disabled={submitting}
        onPress={handleSubmit(onSubmit)}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.spacing[4],
  },
}));
