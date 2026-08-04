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
import { Header } from "@/src/components/Screen";
import { Card } from "@/src/components/Card";
import { StatusBadge } from "@/src/components/StatusBadge";
import { EmptyState, LoadingState } from "@/src/components/States";
import { formatDate } from "@/src/utils/format";

export default function Deliveries() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { selected } = useProjects();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isContractor = user?.rola === "contractor";

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      let path = "/deliveries";
      if (user?.rola === "foreman" && selected) path = `/deliveries?project_id=${selected.id}`;
      setItems(await api<any[]>(path));
    } catch { setItems([]); } finally { setLoading(false); }
  }, [user, selected]);
  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <View style={styles.screen}>
      <Header title={t("deliveries")} back right={isContractor ? (
        <Pressable testID="delivery-add" onPress={() => router.push("/delivery-new")} hitSlop={8}>
          <Ionicons name="add-circle" size={28} color={colors.brand} />
        </Pressable>
      ) : undefined} />
      {loading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState icon="cube-outline" message={t("empty_deliveries")} testID="deliveries-empty" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
          renderItem={({ item }) => (
            <Card testID={`delivery-${item.id}`} onPress={() => router.push(`/delivery/${item.id}`)} style={styles.row}>
              <View style={styles.iconWrap}>
                <Ionicons name={item.zalacznik_url ? "document-attach" : "cube"} size={22} color={colors.brand} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.title} numberOfLines={1}>{item.opis}</Text>
                <Text style={styles.meta}>{item.project_nazwa} · {item.data_planowana ? formatDate(item.data_planowana, lang) : "—"}</Text>
              </View>
              <StatusBadge status={item.status} />
            </Card>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconWrap: { width: 44, height: 44, borderRadius: 8, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  title: { color: colors.onSurface, fontSize: font.base, fontWeight: "700" },
  meta: { color: colors.muted, fontSize: font.sm },
});
