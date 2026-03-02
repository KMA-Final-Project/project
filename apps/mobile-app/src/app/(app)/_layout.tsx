import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function AppLayout() {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.colors.tabBar,
          borderTopColor: theme.colors.divider,
          elevation: 0,
          shadowOpacity: 0,
          height: 56 + insets.bottom, // base 56dp + bottom gesture area
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
      <Tabs.Screen
        name="upload"
        options={{
          title: t("upload.tab"),
          tabBarIcon: ({ size }) => (
            // Upload button gets special primary brand color
            <Ionicons
              name="add-circle-outline"
              size={size + 4}
              color={theme.colors.secondary}
            />
          ),
          tabBarLabelStyle: { color: theme.colors.secondary },
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

      {/* Hide non-tab screens from tab bar */}
      <Tabs.Screen name="processing" options={{ href: null }} />
      <Tabs.Screen name="player" options={{ href: null }} />
    </Tabs>
  );
}
