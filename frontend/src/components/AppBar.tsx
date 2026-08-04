import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { colors, spacing, font } from "@/src/theme/tokens";
import { useAuth } from "@/src/context/AuthContext";
import { useProjects } from "@/src/context/ProjectContext";
import { api } from "@/src/api/client";
import { Avatar } from "./Avatar";

// Top app bar for tab screens: avatar -> profile, title, project selector, notifications bell.
export function AppBar({
  title,
  showProject = false,
}: {
  title: string;
  showProject?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { selected } = useProjects();
  const [unread, setUnread] = useState(0);

  const loadUnread = useCallback(() => {
    api<{ count: number }>("/notifications/unread-count")
      .then((r) => setUnread(r.count))
      .catch(() => {});
  }, []);

  useFocusEffect(useCallback(() => { loadUnread(); }, [loadUnread]));

  return (
    <View style={[styles.bar, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.row}>
        <Pressable testID="appbar-avatar" onPress={() => router.push("/profile")} hitSlop={8}>
          <Avatar uri={user?.avatar_url} imie={user?.imie} nazwisko={user?.nazwisko} size={40} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {showProject && (
            <Pressable testID="appbar-project" onPress={() => router.push("/select-project")} style={styles.projRow}>
              <Ionicons name="business-outline" size={13} color={colors.brand} />
              <Text style={styles.projText} numberOfLines={1}>
                {selected?.nazwa || "—"}
              </Text>
              <Ionicons name="chevron-down" size={13} color={colors.muted} />
            </Pressable>
          )}
        </View>
        <Pressable testID="appbar-bell" onPress={() => router.push("/notifications")} hitSlop={8} style={styles.bell}>
          <Ionicons name="notifications-outline" size={24} color={colors.onSurface} />
          {unread > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread > 9 ? "9+" : unread}</Text>
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  title: { color: colors.onSurface, fontSize: font.xl, fontWeight: "800" },
  projRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  projText: { color: colors.onSurfaceSecondary, fontSize: font.sm, maxWidth: 180 },
  bell: { padding: 4 },
  badge: {
    position: "absolute",
    top: 0,
    right: 0,
    backgroundColor: colors.brand,
    borderRadius: 999,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
});
