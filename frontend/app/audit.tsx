import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { colors, spacing, font, radius } from "@/src/theme/tokens";
import { useI18n } from "@/src/i18n/I18nContext";
import { api } from "@/src/api/client";
import { Header } from "@/src/components/Screen";
import { Card } from "@/src/components/Card";
import { EmptyState, LoadingState } from "@/src/components/States";
import { formatDateTime } from "@/src/utils/format";

export default function Audit() {
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await api<any[]>("/audit-log")); } catch { setItems([]); } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <View style={styles.screen}>
      <Header title={t("audit_log")} back />
      {loading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState icon="list-outline" message={t("empty_audit")} testID="audit-empty" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: insets.bottom + spacing.xxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
          renderItem={({ item }) => (
            <Card style={styles.row}>
              <View style={styles.iconWrap}>
                <Ionicons name="ellipse" size={10} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.action}>{item.akcja.replace(/_/g, " ")}</Text>
                <Text style={styles.meta}>{item.kto} · {item.obiekt_typ}</Text>
                <Text style={styles.time}>{formatDateTime(item.created_at, lang)}</Text>
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
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, paddingVertical: spacing.md },
  iconWrap: { marginTop: 4 },
  action: { color: colors.onSurface, fontSize: font.base, fontWeight: "700", textTransform: "capitalize" },
  meta: { color: colors.onSurfaceSecondary, fontSize: font.sm, marginTop: 2 },
  time: { color: colors.muted, fontSize: font.sm, marginTop: 2 },
});
