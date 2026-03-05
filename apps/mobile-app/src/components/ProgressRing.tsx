/**
 * ProgressRing — Kapter
 *
 * Circular progress indicator built with react-native-svg.
 */
import React from "react";
import { View, Text } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import Svg, { Circle } from "react-native-svg";

interface ProgressRingProps {
  progress: number; // 0–100
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
}

export function ProgressRing({
  progress,
  size = 120,
  strokeWidth = 10,
  showLabel = true,
}: ProgressRingProps) {
  const { theme } = useUnistyles();
  const clampedProgress = Math.max(0, Math.min(100, progress));

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset =
    circumference - (clampedProgress / 100) * circumference;
  const center = size / 2;

  return (
    <View style={styles.wrapper}>
      <Svg width={size} height={size}>
        {/* Track */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={theme.colors.border}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress arc — rotated -90° so it starts from the top */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={theme.colors.primary}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${center}, ${center}`}
        />
      </Svg>

      {showLabel && (
        <View style={[styles.labelContainer, { width: size, height: size }]}>
          <Text style={styles.labelText}>{Math.round(clampedProgress)}%</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrapper: {
    position: "relative",
  },
  labelContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  labelText: {
    fontSize: theme.typography.sizes["2xl"],
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.primary,
  },
}));
