import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter, useFocusEffect } from "expo-router";
import { colors, spacing, font, radius } from "@/src/theme/tokens";
import { useI18n } from "@/src/i18n/I18nContext";
import { useAuth } from "@/src/context/AuthContext";
import { useProjects } from "@/src/context/ProjectContext";
import { api, fileUrl } from "@/src/api/client";
import { AppBar } from "@/src/components/AppBar";
import { Card } from "@/src/components/Card";
import { StatusBadge } from "@/src/components/StatusBadge";
import { Avatar } from "@/src/components/Avatar";
import { EmptyState, LoadingState, ErrorState } from "@/src/components/States";
import { formatDate } from "@/src/utils/format";

export default function Reports() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { selected } = useProjects();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const role = user?.rola;
  const canCreate = role === "worker" || role === "subcontractor";
  const isContractor = role === "contractor";

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      let path = "/reports";
      if (role === "foreman" && selected) path = `/reports?project_id=${selected.id}`;
      const data = await api<any[]>(path);
      setItems(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [role, selected]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const renderItem = ({ item }: { item: any }) => {
    const thumb = item.zdjecia?.[0]?.url ? fileUrl(item.zdjecia[0].url) : null;
    return (
      <Card testID={`report-${item.id}`} onPress={() => router.push(`/report/${item.id}`)} style={styles.row}>
        {thumb ? (
          <Image source={{ uri: thumb }} style={styles.thumb} contentFit="cover" />
        ) : (
          <View style={[styles.thumb, styles.thumbEmpty]}>
            <Ionicons name="document-text-outline" size={22} color={colors.muted} />
          </View>
        )}
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.title} numberOfLines={1}>{item.project_nazwa}</Text>
          <Text style={styles.desc} numberOfLines={1}>{item.opis || "—"}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>{item.autor} · {formatDate(item.data, lang)}</Text>
            {item.zdjecia?.length > 0 && <Ionicons name="image" size={13} color={colors.muted} />}
          </View>
        </View>
        <StatusBadge status={item.status} />
      </Card>
    );
  };

  return (
    <View style={styles.screen}>
      <AppBar title={isContractor ? t("report_history") : t("reports")} showProject={role === "foreman"} />
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={t("error_network")} onRetry={load} retryLabel={t("retry")} />
      ) : items.length === 0 ? (
        <EmptyState icon="document-text-outline" message={t("empty_reports")} testID="reports-empty" />
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
        <Pressable
          testID="fab-new-report"
          onPress={() => router.push("/report-new")}
          style={[styles.fab, { bottom: insets.bottom + spacing.md }]}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  thumb: { width: 52, height: 52, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  title: { color: colors.onSurface, fontSize: font.base, fontWeight: "700" },
  desc: { color: colors.onSurfaceSecondary, fontSize: font.base },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  meta: { color: colors.muted, fontSize: font.sm },
  fab: {
    position: "absolute",
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
});
