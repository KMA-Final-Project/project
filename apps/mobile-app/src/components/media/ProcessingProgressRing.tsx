import React, { useEffect } from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import Svg, { Circle } from "react-native-svg";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import type { MediaStatus } from "@/types/media";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface ProcessingProgressRingProps {
  progress: number;
  status: MediaStatus | undefined;
  progressLabel: string;
  size?: number;
  strokeWidth?: number;
}

function withAlpha(color: string, alphaHex: string): string {
  if (color.startsWith("#") && color.length === 7) {
    return `${color}${alphaHex}`;
  }

  return color;
}

function RingWave({
  size,
  color,
  delay,
  active,
}: {
  size: number;
  color: string;
  delay: number;
  active: boolean;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!active) {
      progress.value = withTiming(0, { duration: 180 });
      return;
    }

    progress.value = 0;
    progress.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, {
          duration: 2200,
          easing: Easing.out(Easing.cubic),
        }),
        -1,
        false,
      ),
    );
  }, [active, delay, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: active
      ? interpolate(
          progress.value,
          [0, 0.65, 1],
          [0.26, 0.12, 0],
          Extrapolation.CLAMP,
        )
      : 0,
    transform: [
      {
        scale: interpolate(
          progress.value,
          [0, 1],
          [0.82, 1.28],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ringWave,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: withAlpha(color, "40"),
          backgroundColor: withAlpha(color, "10"),
        },
        animatedStyle,
      ]}
    />
  );
}

export function ProcessingProgressRing({
  progress,
  status,
  progressLabel,
  size = 160,
  strokeWidth = 10,
}: ProcessingProgressRingProps) {
  const { theme } = useUnistyles();
  const isDone = status === "COMPLETED";
  const isFailed = status === "FAILED";
  const animated = !isDone && !isFailed;
  const color = isFailed
    ? theme.colors.error
    : isDone
      ? theme.colors.success
      : theme.colors.primary;
  const clampedProgress = Math.min(1, Math.max(0, progress));
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const circumference = 2 * Math.PI * r;
  const progressValue = useSharedValue(clampedProgress);
  const auraValue = useSharedValue(0);

  useEffect(() => {
    progressValue.value = withTiming(clampedProgress, {
      duration: 700,
      easing: Easing.out(Easing.cubic),
    });
  }, [clampedProgress, progressValue]);

  useEffect(() => {
    if (!animated) {
      auraValue.value = withTiming(0, { duration: 180 });
      return;
    }

    auraValue.value = withRepeat(
      withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [animated, auraValue]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progressValue.value),
  }));

  const auraStyle = useAnimatedStyle(() => ({
    opacity: animated
      ? interpolate(auraValue.value, [0, 1], [0.22, 0.38], Extrapolation.CLAMP)
      : 0,
    transform: [
      {
        scale: interpolate(
          auraValue.value,
          [0, 1],
          [0.96, 1.04],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  return (
    <View style={styles.ringStack}>
      <View
        style={[styles.ringWrapper, { width: size + 24, height: size + 24 }]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ringAura,
            {
              width: size - 20,
              height: size - 20,
              borderRadius: (size - 20) / 2,
              backgroundColor: withAlpha(color, "16"),
            },
            auraStyle,
          ]}
        />
        <RingWave size={size - 8} color={color} delay={0} active={animated} />
        <RingWave
          size={size - 8}
          color={color}
          delay={1100}
          active={animated}
        />
        <Svg
          width={size}
          height={size}
          style={{ transform: [{ rotate: "-90deg" }] }}
        >
          <Circle
            cx={cx}
            cy={cx}
            r={r}
            stroke={theme.colors.surface}
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          <AnimatedCircle
            cx={cx}
            cy={cx}
            r={r}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeDasharray={circumference}
            strokeLinecap="round"
            animatedProps={animatedProps}
          />
        </Svg>
      </View>

      <View style={[styles.ringCenter, { width: size, height: size }]}>
        {isDone ? (
          <Ionicons
            name="checkmark-circle"
            size={48}
            color={theme.colors.success}
          />
        ) : isFailed ? (
          <Ionicons name="close-circle" size={48} color={theme.colors.error} />
        ) : (
          <>
            <Text style={[styles.ringPercent, { color: theme.colors.text }]}>
              {Math.round(clampedProgress * 100)}%
            </Text>
            <Text
              style={[styles.ringLabel, { color: theme.colors.textSecondary }]}
            >
              {progressLabel}
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  ringStack: {
    position: "relative",
    width: 184,
    height: 184,
    alignItems: "center",
    justifyContent: "center",
  },
  ringWrapper: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  ringAura: {
    position: "absolute",
  },
  ringWave: {
    position: "absolute",
    borderWidth: 1,
  },
  ringCenter: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  ringPercent: {
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: -1,
  },
  ringLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: 2,
  },
}));
