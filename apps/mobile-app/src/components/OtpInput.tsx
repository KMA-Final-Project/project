import React, { useRef, useCallback } from "react";
import { TextInput as RNTextInput, View, Text } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from "react-native-reanimated";

const AnimatedTextInput = Animated.createAnimatedComponent(RNTextInput);

interface OtpCellProps {
  digit: string;
  error?: string;
  onChangeText: (text: string) => void;
  onBackspace: () => void;
  onRef: (ref: RNTextInput | null) => void;
}

function OtpCell({
  digit,
  error,
  onChangeText,
  onBackspace,
  onRef,
}: OtpCellProps) {
  const { theme } = useUnistyles();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handleFocus = useCallback(() => {
    scale.value = withSequence(
      withTiming(1.05, { duration: 100 }),
      withTiming(1, { duration: 100 }),
    );
  }, [scale]);

  return (
    <AnimatedTextInput
      ref={(ref) => onRef(ref as RNTextInput | null)}
      style={[
        styles.cell,
        digit ? styles.cellFilled : null,
        error ? styles.cellError : null,
        animatedStyle,
      ]}
      value={digit}
      onChangeText={onChangeText}
      onKeyPress={(e) => {
        if (e.nativeEvent.key === "Backspace") onBackspace();
      }}
      onFocus={handleFocus}
      keyboardType="number-pad"
      maxLength={1}
      selectTextOnFocus
      placeholderTextColor={theme.colors.placeholder}
    />
  );
}

interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

export function OtpInput({
  length = 6,
  value,
  onChange,
  error,
}: OtpInputProps) {
  const inputRefs = useRef<(RNTextInput | null)[]>([]);

  const digits = value
    .split("")
    .concat(Array(length).fill(""))
    .slice(0, length);

  const handleChange = useCallback(
    (text: string, index: number) => {
      const digit = text.replace(/[^0-9]/g, "").slice(-1);
      const arr = digits.slice();
      arr[index] = digit;
      const newValue = arr.join("").slice(0, length);
      onChange(newValue);

      if (digit && index < length - 1) {
        inputRefs.current[index + 1]?.focus();
      }
    },
    [digits, length, onChange],
  );

  const handleBackspace = useCallback(
    (index: number) => {
      if (!digits[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
        const arr = digits.slice();
        arr[index - 1] = "";
        onChange(arr.join(""));
      }
    },
    [digits, onChange],
  );

  return (
    <View>
      <View style={styles.row}>
        {digits.map((digit, i) => (
          <OtpCell
            key={i}
            digit={digit}
            error={error}
            onChangeText={(text) => handleChange(text, i)}
            onBackspace={() => handleBackspace(i)}
            onRef={(ref) => {
              inputRefs.current[i] = ref;
            }}
          />
        ))}
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    justifyContent: "center",
    gap: theme.spacing[3],
  },
  cell: {
    width: 48,
    height: 56,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.lg,
    textAlign: "center",
    fontSize: theme.typography.sizes.xl,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
  },
  cellFilled: {
    borderColor: theme.colors.primary,
  },
  cellError: {
    borderColor: theme.colors.error,
  },
  errorText: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.error,
    textAlign: "center",
    marginTop: theme.spacing[2],
  },
}));
