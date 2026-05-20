import React from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";

interface SegmentedControlProps {
  segments: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
}

export function SegmentedControl({
  segments,
  selectedIndex,
  onChange,
}: SegmentedControlProps) {
  //   const { theme } = useUnistyles();
  const translateX = useSharedValue(0);

  React.useEffect(() => {
    translateX.value = withTiming(selectedIndex * (1 / segments.length) * 100, {
      duration: 250,
      easing: Easing.out(Easing.cubic),
    });
  }, [selectedIndex, segments.length, translateX]);

  const indicatorStyle = useAnimatedStyle(() => ({
    left: `${translateX.value}%` as unknown as number,
    width: `${100 / segments.length}%` as unknown as number,
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.indicator, indicatorStyle]} />
      {segments.map((label, index) => (
        <Pressable
          key={label}
          style={styles.segment}
          onPress={() => onChange(index)}
        >
          <Text
            style={[
              styles.label,
              index === selectedIndex && styles.labelActive,
            ]}
          >
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flexDirection: "row",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    padding: 4,
    position: "relative",
  },
  indicator: {
    position: "absolute",
    top: 4,
    bottom: 4,
    borderRadius: theme.radii.lg - 2,
    backgroundColor: theme.colors.primary,
  },
  segment: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing[3],
    zIndex: 1,
  },
  label: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.textSecondary,
  },
  labelActive: {
    color: theme.colors.textOnPrimary,
    fontWeight: theme.typography.weights.semibold,
  },
}));
