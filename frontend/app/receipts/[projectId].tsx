import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useFocusEffect } from "expo-router";
import { colors, spacing, font, radius } from "@/src/theme/tokens";
import { useI18n } from "@/src/i18n/I18nContext";
import { api } from "@/src/api/client";
import { Header } from "@/src/components/Screen";
import { Card } from "@/src/components/Card";
import { Button } from "@/src/components/Button";
import { EmptyState, LoadingState } from "@/src/components/States";
import { useToast } from "@/src/components/Toast";

export default function Receipts() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sel, setSel] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try { setItems(await api<any[]>(`/projects/${projectId}/elements/pending-receipt`)); }
    catch { setItems([]); } finally { setLoading(false); }
  }, [projectId]);
  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const toggle = (id: string) => setSel((s) => ({ ...s, [id]: !s[id] }));
  const allIds = items.map((i) => i.id);
  const selCount = Object.values(sel).filter(Boolean).length;
  const selectAll = () => setSel(Object.fromEntries(allIds.map((id) => [id, true])));

  const receive = async () => {
    const ids = allIds.filter((id) => sel[id]);
    if (!ids.length) return;
    try {
      const r = await api<{ odebrano: number }>(`/projects/${projectId}/elements/receive`, { method: "POST", body: { element_ids: ids } });
      toast.show(`${t("receive")}: ${r.odebrano}`); setSel({}); load();
    } catch (e: any) { toast.show(e.message || t("error_generic"), "error"); }
  };

  // group by folder + view
  const groups: Record<string, any[]> = {};
  items.forEach((i) => { const k = `${i.folder_nazwa} · ${i.widok_nazwa}`; (groups[k] = groups[k] || []).push(i); });

  return (
    <View style={styles.screen}>
      <Header title={t("receipts")} back right={items.length > 0 ? (
        <Pressable testID="select-all" onPress={selectAll} hitSlop={8}><Ionicons name="checkmark-done" size={24} color={colors.brand} /></Pressable>
      ) : undefined} />
      {loading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState icon="checkmark-circle-outline" message={t("empty_pending_receipt")} testID="receipts-empty" />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: insets.bottom + 96 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        >
          {Object.entries(groups).map(([g, els]) => (
            <View key={g} style={{ gap: spacing.sm }}>
              <Text style={styles.group}>{g}</Text>
              {els.map((e) => (
                <Pressable key={e.id} testID={`receipt-${e.id}`} onPress={() => toggle(e.id)}>
                  <Card style={[styles.row, sel[e.id] && styles.rowSel]}>
                    <Ionicons name={sel[e.id] ? "checkbox" : "square-outline"} size={22} color={sel[e.id] ? colors.brand : colors.muted} />
                    <Text style={styles.kod}>{e.kod}</Text>
                    <View style={styles.readyDot} />
                  </Card>
                </Pressable>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
      {items.length > 0 && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
          <Button title={`${t("receive_selected")} (${selCount})`} onPress={receive} disabled={selCount === 0} testID="receive-btn" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  group: { color: colors.muted, fontSize: font.sm, fontWeight: "700", textTransform: "uppercase" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  rowSel: { borderColor: colors.brand },
  kod: { color: colors.onSurface, fontSize: font.lg, fontWeight: "700", flex: 1 },
  readyDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.warning },
  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.surface },
});
