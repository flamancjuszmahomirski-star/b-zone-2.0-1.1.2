import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { colors, spacing, font } from "@/src/theme/tokens";
import { useI18n } from "@/src/i18n/I18nContext";
import { useAuth } from "@/src/context/AuthContext";
import { useProjects } from "@/src/context/ProjectContext";
import { api } from "@/src/api/client";
import { AppBar } from "@/src/components/AppBar";
import { Card } from "@/src/components/Card";
import { StatusBadge } from "@/src/components/StatusBadge";
import { EmptyState, LoadingState, ErrorState } from "@/src/components/States";
import { formatDate } from "@/src/utils/format";

const prioColor = (p: string) =>
  p === "wysoki" ? colors.error : p === "sredni" ? colors.warning : colors.muted;

export default function Issues() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { selected } = useProjects();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const role = user?.rola;
  const canCreate = role === "worker" || role === "subcontractor";

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      let path = "/issues";
      if (role === "foreman" && selected) path = `/issues?project_id=${selected.id}`;
      setItems(await api<any[]>(path));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [role, selected]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const renderItem = ({ item }: { item: any }) => (
    <Card testID={`issue-${item.id}`} onPress={() => router.push(`/issue/${item.id}`)} style={styles.card}>
      <View style={styles.topRow}>
        <View style={[styles.prioDot, { backgroundColor: prioColor(item.priorytet) }]} />
        <Text style={styles.title} numberOfLines={1}>{item.tytul}</Text>
        <StatusBadge status={item.status} />
      </View>
      <Text style={styles.desc} numberOfLines={2}>{item.opis}</Text>
      <Text style={styles.meta}>{item.project_nazwa} · {item.autor} · {formatDate(item.created_at, lang)}</Text>
    </Card>
  );

  return (
    <View style={styles.screen}>
      <AppBar title={t("issues")} showProject={role === "foreman"} />
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={t("error_network")} onRetry={load} retryLabel={t("retry")} />
      ) : items.length === 0 ? (
        <EmptyState icon="alert-circle-outline" message={t("empty_issues")} testID="issues-empty" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + 96 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        />
      )}
      {canCreate && (
        <Pressable testID="fab-new-issue" onPress={() => router.push("/issue-new")} style={[styles.fab, { bottom: insets.bottom + spacing.md }]}>
          <Ionicons name="add" size={28} color="#fff" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  card: { gap: spacing.sm },
  topRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  prioDot: { width: 10, height: 10, borderRadius: 5 },
  title: { color: colors.onSurface, fontSize: font.lg, fontWeight: "700", flex: 1 },
  desc: { color: colors.onSurfaceSecondary, fontSize: font.base },
  meta: { color: colors.muted, fontSize: font.sm },
  fab: {
    position: "absolute", right: spacing.lg, width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.brand, alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
});
