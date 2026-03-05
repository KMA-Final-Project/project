/**
 * SearchBar — Kapter
 *
 * Themed text input with a search icon prefix and an optional clear button.
 */
import React, { useState } from "react";
import { View, TextInput, Pressable } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Ionicons } from "@expo/vector-icons";

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}

export function SearchBar({
  value,
  onChangeText,
  placeholder = "Search...",
}: SearchBarProps) {
  const { theme } = useUnistyles();
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.container, focused && styles.containerFocused]}>
      <Ionicons
        name="search-outline"
        size={18}
        color={focused ? theme.colors.primary : theme.colors.placeholder}
        style={styles.icon}
      />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        returnKeyType="search"
      />
      {value.length > 0 && (
        <Pressable onPress={() => onChangeText("")} hitSlop={8}>
          <Ionicons
            name="close-circle"
            size={18}
            color={theme.colors.placeholder}
          />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii["lg"],
    paddingHorizontal: theme.spacing[4],
    height: 44,
  },
  containerFocused: {
    // Removed border change on focus since it's borderless now
  },
  icon: {
    marginRight: theme.spacing[2],
  },
  input: {
    flex: 1,
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.text,
    padding: 0,
  },
}));
