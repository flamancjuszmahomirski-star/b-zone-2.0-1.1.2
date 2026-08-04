import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { colors, spacing, font, radius } from "@/src/theme/tokens";
import { useI18n } from "@/src/i18n/I18nContext";
import { api } from "@/src/api/client";
import { Header } from "@/src/components/Screen";
import { Card } from "@/src/components/Card";
import { StatusBadge } from "@/src/components/StatusBadge";
import { EmptyState, LoadingState } from "@/src/components/States";

export default function Projects() {
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<"aktywny" | "zarchiwizowany">("aktywny");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await api<any[]>(`/projects?status=${tab}`)); } catch { setItems([]); } finally { setLoading(false); }
  }, [tab]);
  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <View style={styles.screen}>
      <Header title={t("projects")} back right={
        <Pressable testID="projects-add" onPress={() => router.push("/project-form")} hitSlop={8}>
          <Ionicons name="add-circle" size={28} color={colors.brand} />
        </Pressable>
      } />
      <View style={styles.tabs}>
        {(["aktywny", "zarchiwizowany"] as const).map((tb) => (
          <Pressable key={tb} testID={`ptab-${tb}`} onPress={() => setTab(tb)} style={[styles.tab, tab === tb && styles.tabActive]}>
            <Text style={[styles.tabText, tab === tb && { color: colors.brand }]}>{tb === "aktywny" ? t("active_projects") : t("archive_view")}</Text>
          </Pressable>
        ))}
      </View>
      {loading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState icon="business-outline" message={t("empty_projects")} testID="projects-empty" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
          renderItem={({ item }) => (
            <Card testID={`project-${item.id}`} onPress={() => router.push(`/project/${item.id}`)} style={styles.card}>
              <View style={styles.topRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.nazwa}</Text>
                  <Text style={styles.meta}>{item.kod ? `${item.kod} · ` : ""}{item.klient_nazwa || item.adres || ""}</Text>
                </View>
                <StatusBadge status={item.status} />
              </View>
              <View style={styles.statChip}>
                <Ionicons name="people" size={14} color={colors.muted} />
                <Text style={styles.statText}>{item.liczba_czlonkow || 0}</Text>
              </View>
            </Card>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  tabs: { flexDirection: "row", paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
  tab: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  tabActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  tabText: { color: colors.muted, fontSize: font.base, fontWeight: "700" },
  card: { gap: spacing.sm },
  topRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  name: { color: colors.onSurface, fontSize: font.lg, fontWeight: "800" },
  meta: { color: colors.muted, fontSize: font.base, marginTop: 2 },
  statChip: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", backgroundColor: colors.surfaceTertiary, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  statText: { color: colors.onSurfaceSecondary, fontSize: font.sm, fontWeight: "700" },
});
