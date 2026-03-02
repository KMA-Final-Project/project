/**
 * Upload Tab (Placeholder) — Kapter
 *
 * This screen acts as a trigger button in the Tab bar.
 * In a real flow, intercepting the tab press to show a BottomSheet
 * without navigating is better, but this serves as a fallback/mount point
 * for the Upload BottomSheet to live on.
 */
import React from "react";
import { View, Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export default function UploadTab() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Upload Modal Trigger</Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.background,
  },
  text: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.base,
  },
}));
