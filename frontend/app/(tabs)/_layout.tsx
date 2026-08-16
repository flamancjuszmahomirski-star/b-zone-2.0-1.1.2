import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing } from "@/src/theme/tokens";
import { useI18n } from "@/src/i18n/I18nContext";
import { useAuth } from "@/src/context/AuthContext";

export default function TabsLayout() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const role = user?.rola;
  const isContractor = role === "contractor";

  const icon =
    (name: keyof typeof Ionicons.glyphMap, nameFocused: keyof typeof Ionicons.glyphMap) => {
      const IconRender = ({ color, focused, size }: { color: string; focused: boolean; size: number }) => (
        <Ionicons name={focused ? nameFocused : name} size={size} color={color} />
      );
      IconRender.displayName = `TabIcon_${name}`;
      return IconRender;
    };

  return (
    <Tabs
      screenListeners={{
        tabPress: () => {
          if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
        },
      }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopColor: colors.divider,
          borderTopWidth: 1,
          // D: base height + system inset so gesture/3-button nav bars never
          // overlap the tabs on edge-to-edge Android or notched iOS.
          height: (Platform.OS === "ios" ? 60 : 58) + insets.bottom,
          paddingTop: spacing.sm,
          paddingBottom: insets.bottom + spacing.xs,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t("tab_home"), tabBarIcon: icon("grid-outline", "grid") }}
      />
      <Tabs.Screen
        name="reports"
        options={{ title: t("tab_reports"), tabBarIcon: icon("document-text-outline", "document-text") }}
      />
      <Tabs.Screen
        name="hours"
        options={{
          title: t("tab_hours"),
          tabBarIcon: icon("time-outline", "time"),
          href: isContractor ? null : "/(tabs)/hours",
        }}
      />
      <Tabs.Screen
        name="issues"
        options={{
          title: t("tab_issues"),
          tabBarIcon: icon("alert-circle-outline", "alert-circle"),
          href: isContractor ? null : "/(tabs)/issues",
        }}
      />
      <Tabs.Screen
        name="more"
        options={{ title: t("tab_more"), tabBarIcon: icon("ellipsis-horizontal", "ellipsis-horizontal") }}
      />
    </Tabs>
  );
}
