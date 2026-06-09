/**
 * BottomSheet — Kapter
 *
 * Animated modal bottom sheet with drag handle, backdrop dimming,
 * and slide-up animation via Reanimated.
 */
import React, { useEffect, useCallback } from "react";
import { View, Modal, TouchableWithoutFeedback } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  height?: number;
}

const SHEET_HEIGHT = 340;
const DISMISS_THRESHOLD = 80;

export function BottomSheet({
  visible,
  onClose,
  children,
  height,
}: BottomSheetProps) {
  const translateY = useSharedValue(height ?? SHEET_HEIGHT);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = withTiming(0, {
        duration: 300,
        easing: Easing.out(Easing.cubic),
      });
      backdropOpacity.value = withTiming(1, { duration: 250 });
    } else {
      translateY.value = withTiming(height ?? SHEET_HEIGHT, { duration: 220 });
      backdropOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [visible, translateY, backdropOpacity, height]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  // Animate the sheet out, then call onClose on JS thread when done
  const closeWithAnimation = useCallback(() => {
    translateY.value = withTiming(height ?? SHEET_HEIGHT, { duration: 220 });
    backdropOpacity.value = withTiming(0, { duration: 200 }, (finished) => {
      "worklet";
      if (finished) runOnJS(onClose)();
    });
  }, [onClose, translateY, backdropOpacity, height]);

  // Legacy worklet handle (used inside gesture worklets)
  const handleClose = useCallback(() => {
    "worklet";
    runOnJS(onClose)();
  }, [onClose]);

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      "worklet";
      if (e.translationY > 0) {
        translateY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      "worklet";
      if (e.translationY > DISMISS_THRESHOLD) {
        translateY.value = withTiming(height ?? SHEET_HEIGHT, {
          duration: 200,
        });
        backdropOpacity.value = withTiming(0, { duration: 200 }, () => {
          handleClose();
        });
      } else {
        translateY.value = withTiming(0, {
          duration: 250,
          easing: Easing.out(Easing.cubic),
        });
      }
    });

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={closeWithAnimation}
    >
      <GestureHandlerRootView style={styles.root}>
        {/* Backdrop */}
        <TouchableWithoutFeedback onPress={closeWithAnimation}>
          <Animated.View style={[styles.backdrop, backdropStyle]} />
        </TouchableWithoutFeedback>

        {/* Sheet */}
        <Animated.View
          style={[
            styles.sheet,
            {
              minHeight: height ?? SHEET_HEIGHT,
              maxHeight: height ?? "auto",
            },
            sheetStyle,
          ]}
        >
          <GestureDetector gesture={panGesture}>
            <View style={styles.handleContainer}>
              <View style={styles.handle} />
            </View>
          </GestureDetector>
          {children}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: theme.colors.backdrop,
  },
  sheet: {
    backgroundColor: theme.colors.card,
    borderTopLeftRadius: theme.radii["2xl"],
    borderTopRightRadius: theme.radii["2xl"],
    minHeight: SHEET_HEIGHT,
    paddingHorizontal: theme.spacing[5],
    paddingBottom: theme.spacing[8],
  },
  handleContainer: {
    alignItems: "center",
    paddingTop: theme.spacing[3],
    paddingBottom: theme.spacing[4],
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.border,
  },
}));
