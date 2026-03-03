/**
 * IconButton — Kapter
 *
 * Pressable icon-only button with Reanimated scale feedback.
 * Uses @expo/vector-icons under the hood.
 */
import React from "react";
import { Pressable } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet } from "react-native-unistyles";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface IconButtonProps {
  name: React.ComponentProps<typeof Ionicons>["name"];
  size?: number;
  color?: string;
  onPress?: () => void;
  disabled?: boolean;
  /** Optional hit-slop padding in px (default 8) */
  hitSlop?: number;
  accessibilityLabel?: string;
}

export function IconButton({
  name,
  size = 24,
  color,
  onPress,
  disabled,
  hitSlop = 8,
  accessibilityLabel,
}: IconButtonProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: disabled ? 0.4 : 1,
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      onPressIn={() => {
        scale.value = withTiming(0.88, { duration: 100 });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: 150 });
      }}
      hitSlop={hitSlop}
      style={[styles.container, animatedStyle]}
    >
      <Ionicons name={name} size={size} color={color} style={styles.icon} />
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    color: theme.colors.text,
  },
}));
