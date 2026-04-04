import React, { useEffect, useRef } from "react";
import { Animated, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

interface StreamingTailIndicatorProps {
  label: string;
}

export function StreamingTailIndicator({ label }: StreamingTailIndicatorProps) {
  const dotAnimations = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  useEffect(() => {
    const loops = dotAnimations.map((value, index) => {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.delay(index * 140),
          Animated.timing(value, {
            toValue: 1,
            duration: 260,
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: 260,
            useNativeDriver: true,
          }),
          Animated.delay(180),
        ]),
      );

      animation.start();
      return animation;
    });

    return () => {
      loops.forEach((animation) => animation.stop());
    };
  }, [dotAnimations]);

  return (
    <View style={styles.container}>
      <View style={styles.dotsRow}>
        {dotAnimations.map((animation, index) => (
          <Animated.View
            key={index}
            style={[
              styles.dot,
              {
                opacity: animation.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.35, 1],
                }),
                transform: [
                  {
                    translateY: animation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -4],
                    }),
                  },
                  {
                    scale: animation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.85, 1.15],
                    }),
                  },
                ],
              },
            ]}
          />
        ))}
      </View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[2],
    paddingTop: theme.spacing[2],
    paddingBottom: theme.spacing[5],
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[2],
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.primary,
  },
  label: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
  },
}));
