import React from "react";
import {
  TextInput as RNTextInput,
  View,
  Text,
  type TextInputProps as RNTextInputProps,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

interface TextInputProps extends RNTextInputProps {
  label: string;
  error?: string;
}

export function TextInput({ label, error, style, ...props }: TextInputProps) {
  const { theme } = useUnistyles();

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <RNTextInput
        style={[styles.input, error && styles.inputError, style]}
        placeholderTextColor={theme.colors.placeholder}
        autoCapitalize="none"
        {...props}
      />
      {error && (
        <Animated.Text
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          style={styles.errorText}
        >
          {error}
        </Animated.Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.gap(2),
  },
  label: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.text,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.lg,
    paddingHorizontal: theme.spacing[4],
    fontSize: theme.typography.sizes.base,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
  },
  inputError: {
    borderColor: theme.colors.error,
  },
  errorText: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.error,
  },
}));
