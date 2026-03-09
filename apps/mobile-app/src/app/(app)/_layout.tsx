/**
 * App Tab Layout — Kapter
 *
 * Hosts the 3-tab bottom navigation.
 * The Upload FAB intercepts its own tab press (preventDefault) so it
 * never actually navigates to upload.tsx — instead it shows the
 * UploadSheet bottom sheet as an overlay on top of whatever screen is active.
 */
import React, { useState } from "react";
import { View } from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import UploadTab from "./upload";
import { useSocketSync } from "@/hooks/useSocketSync";

export default function AppLayout() {
  useSocketSync(); // Global socket event listener Sync -> Tanstack Query

  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  // Upload sheet state — lives HERE so it appears as an overlay over any tab
  const [uploadVisible, setUploadVisible] = useState(false);

  const handleCloseUpload = () => {
    setUploadVisible(false);
  };

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: theme.colors.tabBar,
            borderTopColor: theme.colors.divider,
            elevation: 0,
            shadowOpacity: 0,
            height: 56 + insets.bottom,
            paddingBottom: insets.bottom,
            paddingTop: 8,
          },
          tabBarActiveTintColor: theme.colors.tabBarActive,
          tabBarInactiveTintColor: theme.colors.tabBarInactive,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: t("library.title"),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="library-outline" size={size} color={color} />
            ),
          }}
        />

        {/* Upload FAB — tab navigation intercepted; shows sheet instead */}
        <Tabs.Screen
          name="upload"
          listeners={{
            tabPress: (e) => {
              e.preventDefault(); // ← Block navigation entirely
              setUploadVisible(true);
            },
          }}
          options={{
            title: t("upload.tab"),
            tabBarLabel: () => null,
            tabBarIcon: () => (
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: theme.colors.primary,
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: -24,
                  shadowColor: theme.colors.primary,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 8,
                  elevation: 5,
                }}
              >
                <Ionicons name="add" size={32} color="#fff" />
              </View>
            ),
          }}
        />

        <Tabs.Screen
          name="settings"
          options={{
            title: t("common.settings"),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="settings-outline" size={size} color={color} />
            ),
          }}
        />

        {/* Hidden stack screens */}
        <Tabs.Screen name="processing" options={{ href: null }} />
        <Tabs.Screen name="player" options={{ href: null }} />
        <Tabs.Screen name="media-picker" options={{ href: null }} />
      </Tabs>

      <UploadTab visible={uploadVisible} onClose={handleCloseUpload} />
    </>
  );
}
