/**
 * App Tab Layout — Kapter
 *
 * Hosts the 3-tab bottom navigation.
 * The Upload FAB intercepts its own tab press (preventDefault) so it
 * never actually navigates to upload.tsx — instead it shows the
 * UploadSheet bottom sheet as an overlay on top of whatever screen is active.
 */
import React, { useState } from "react";
import { View, Text, useWindowDimensions, Pressable } from "react-native";
import { Tabs, useSegments } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";

import UploadModals from "@/components/media/UploadModals";
import { useSocketSync } from "@/hooks/useSocketSync";

function hexToRgba(hex: string, alpha: number) {
  if (!hex || !hex.startsWith("#")) return hex;
  const cleaned = hex.replace("#", "");
  const r = parseInt(cleaned.substring(0, 2), 16);
  const g = parseInt(cleaned.substring(2, 4), 16);
  const b = parseInt(cleaned.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const { width: screenWidth } = useWindowDimensions();

  const segments = useSegments();
  const hiddenTabRoutes = new Set([
    "processing",
    "player",
    "media-picker",
    "word-bank",
  ]);
  const activeLeafSegment = segments[segments.length - 1];
  const shouldHideTabBar =
    (typeof activeLeafSegment === "string" &&
      hiddenTabRoutes.has(activeLeafSegment)) ||
    (segments as string[]).includes("onboarding");

  if (shouldHideTabBar) {
    return null;
  }

  const tabBarWidth = screenWidth * 0.62;
  const tabBarLeft = (screenWidth - tabBarWidth) / 2;
  const bottomPosition = insets.bottom > 0 ? insets.bottom + 8 : 16;

  // Only render Library, Upload, and Settings
  const visibleRoutes = state.routes.filter((r) =>
    ["index", "upload", "settings"].includes(r.name),
  );

  return (
    <View
      style={[
        styles.tabBarContainer,
        {
          width: tabBarWidth,
          left: tabBarLeft,
          bottom: bottomPosition,
        },
      ]}
    >
      {visibleRoutes.map((route) => {
        const { options } = descriptors[route.key];
        const isFocused = state.routes[state.index].name === route.name;

        const onPress = () => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        const onLongPress = () => {
          navigation.emit({
            type: "tabLongPress",
            target: route.key,
          });
        };

        if (route.name === "upload") {
          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              // testID={options.tabBarTestID}
              testID="upload-tab-button"
              onPress={onPress}
              onLongPress={onLongPress}
              style={styles.addButtonContainer}
            >
              <View style={styles.addButton}>
                <Ionicons
                  name="add"
                  size={28}
                  color={theme.colors.textOnPrimary}
                />
              </View>
            </Pressable>
          );
        }

        const isLibrary = route.name === "index";
        const iconName = isLibrary ? "library-outline" : "settings-outline";
        const label = isLibrary ? t("library.title") : t("common.settings");

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            // testID={options.tabBarTestID}
            testID={`${route.name}-tab-button`}
            onPress={onPress}
            onLongPress={onLongPress}
            style={styles.tabButton}
          >
            <View
              style={isFocused ? styles.activeCapsule : styles.inactiveCapsule}
            >
              <Ionicons
                name={iconName}
                size={20}
                color={
                  isFocused
                    ? theme.colors.tabBarActive
                    : theme.colors.tabBarInactive
                }
              />
              <Text
                style={[
                  styles.tabLabel,
                  {
                    color: isFocused
                      ? theme.colors.tabBarActive
                      : theme.colors.tabBarInactive,
                  },
                ]}
              >
                {label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function AppLayout() {
  useSocketSync(); // Global socket event listener Sync -> Tanstack Query

  const [uploadVisible, setUploadVisible] = useState(false);

  const handleCloseUpload = () => {
    setUploadVisible(false);
  };

  return (
    <>
      <Tabs
        tabBar={(props) => <CustomTabBar {...props} />}
        screenOptions={{
          headerShown: false,
        }}
      >
        <Tabs.Screen name="index" />

        {/* Upload FAB — tab navigation intercepted; shows sheet instead */}
        <Tabs.Screen
          name="upload"
          listeners={{
            tabPress: (e) => {
              e.preventDefault(); // ← Block navigation entirely
              setUploadVisible(true);
            },
          }}
        />

        <Tabs.Screen name="settings" />

        {/* Hidden stack screens */}
        <Tabs.Screen name="processing" options={{ href: null }} />
        <Tabs.Screen name="player" options={{ href: null }} />
        <Tabs.Screen name="media-picker" options={{ href: null }} />
        <Tabs.Screen name="word-bank" options={{ href: null }} />
        <Tabs.Screen name="onboarding" options={{ href: null }} />
      </Tabs>

      <UploadModals visible={uploadVisible} onClose={handleCloseUpload} />
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  tabBarContainer: {
    position: "absolute",
    height: 68,
    borderRadius: 24,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-evenly",
    paddingHorizontal: theme.spacing[2],
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
  },
  activeCapsule: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: theme.radii.lg,
    backgroundColor: hexToRgba(theme.colors.primary, 0.08),
    minWidth: 72,
  },
  inactiveCapsule: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: theme.radii.lg,
    backgroundColor: "transparent",
    opacity: 0.7,
    minWidth: 72,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: theme.typography.weights.bold,
    marginTop: 2,
  },
  addButtonContainer: {
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    paddingHorizontal: 4,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
}));
