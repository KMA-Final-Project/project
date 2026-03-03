/**
 * Card — Kapter
 *
 * Generic themed card container. Wraps content with rounded corners,
 * border, themed background, and optional press feedback.
 */
import React from "react";
import { View, type ViewProps } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { Pressable } from "react-native";
import { StyleSheet } from "react-native-unistyles";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface CardProps extends ViewProps {
  variant?: "default" | "elevated";
  onPress?: () => void;
  children: React.ReactNode;
}

export function Card({
  variant = "default",
  onPress,
  children,
  style,
  ...rest
}: CardProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  if (onPress) {
    return (
      <AnimatedPressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={rest.accessibilityLabel}
        accessibilityState={{ disabled: false }}
        onPressIn={() => {
          scale.value = withTiming(0.98, { duration: 120 });
        }}
        onPressOut={() => {
          scale.value = withTiming(1, { duration: 120 });
        }}
        style={[
          styles.card,
          variant === "elevated" && styles.elevated,
          animatedStyle,
          style as any,
        ]}
        {...(rest as any)}
      >
        {children}
      </AnimatedPressable>
    );
  }

  return (
    <View
      style={[styles.card, variant === "elevated" && styles.elevated, style]}
      {...rest}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radii.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing[4],
  },
  elevated: {
    backgroundColor: theme.colors.elevated,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 0,
  },
}));
