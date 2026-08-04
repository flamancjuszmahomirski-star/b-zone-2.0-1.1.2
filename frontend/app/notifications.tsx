import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { colors, spacing, font, radius } from "@/src/theme/tokens";
import { useI18n } from "@/src/i18n/I18nContext";
import { api } from "@/src/api/client";
import { Header } from "@/src/components/Screen";
import { EmptyState, LoadingState } from "@/src/components/States";
import { formatDateTime } from "@/src/utils/format";

const iconFor = (typ: string): keyof typeof Ionicons.glyphMap => {
  if (typ.includes("raport")) return "document-text";
  if (typ.includes("zgloszenie")) return "alert-circle";
  if (typ.includes("godziny")) return "time";
  if (typ.includes("dostawa")) return "cube";
  if (typ.includes("konto")) return "person";
  return "notifications";
};

export default function Notifications() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await api<any[]>("/notifications")); } catch { setItems([]); } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const open = async (item: any) => {
    if (!item.przeczytane) { api(`/notifications/${item.id}/read`, { method: "PATCH" }).catch(() => {}); }
    // action_url is derived from notification type/ref for in-app navigation
    if (item.obiekt_ref && item.typ.includes("raport")) router.push(`/report/${item.obiekt_ref}`);
    else if (item.obiekt_ref && item.typ.includes("zgloszenie")) router.push(`/issue/${item.obiekt_ref}`);
    else if (item.obiekt_ref && item.typ.includes("dostawa")) router.push(`/delivery/${item.obiekt_ref}`);
    else if (item.typ.includes("konto")) router.push("/users");
    else load();
    setTimeout(load, 300);
  };

  const markAll = async () => { await api("/notifications/read-all", { method: "POST" }); load(); };

  return (
    <View style={styles.screen}>
      <Header title={t("notification_center")} back right={items.length > 0 ? (
        <Pressable testID="mark-all-read" onPress={markAll} hitSlop={8}>
          <Ionicons name="checkmark-done" size={24} color={colors.brand} />
        </Pressable>
      ) : undefined} />
      {loading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState icon="notifications-outline" message={t("empty_notifications")} testID="notifications-empty" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: insets.bottom + spacing.xxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
          renderItem={({ item }) => (
            <Pressable testID={`notif-${item.id}`} onPress={() => open(item)} style={[styles.row, !item.przeczytane && styles.unread]}>
              <View style={styles.iconWrap}>
                <Ionicons name={iconFor(item.typ)} size={20} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.text}>{item.tresc}</Text>
                <Text style={styles.time}>{formatDateTime(item.created_at, lang)}</Text>
              </View>
              {!item.przeczytane && <View style={styles.dot} />}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  unread: { borderColor: colors.brandSecondary, backgroundColor: colors.surfaceTertiary },
  iconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  text: { color: colors.onSurface, fontSize: font.base, fontWeight: "500" },
  time: { color: colors.muted, fontSize: font.sm, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand },
});
