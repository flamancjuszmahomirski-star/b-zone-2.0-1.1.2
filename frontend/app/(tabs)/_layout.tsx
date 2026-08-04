import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { colors, spacing } from "@/src/theme/tokens";
import { useI18n } from "@/src/i18n/I18nContext";
import { useAuth } from "@/src/context/AuthContext";

export default function TabsLayout() {
  const { t } = useI18n();
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
          height: Platform.OS === "ios" ? 88 : 66,
          paddingTop: spacing.sm,
          paddingBottom: Platform.OS === "ios" ? 28 : spacing.sm,
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
