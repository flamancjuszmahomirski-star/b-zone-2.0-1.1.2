import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { colors, spacing, font, radius } from "@/src/theme/tokens";
import { useI18n } from "@/src/i18n/I18nContext";
import { api } from "@/src/api/client";
import { Header } from "@/src/components/Screen";
import { Card } from "@/src/components/Card";
import { EmptyState, LoadingState } from "@/src/components/States";

export default function Archive() {
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    try { setItems(await api<any[]>("/projects?status=zarchiwizowany")); } catch { setItems([]); } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const filtered = items.filter((i) => i.nazwa.toLowerCase().includes(q.toLowerCase()));

  return (
    <View style={styles.screen}>
      <Header title={t("archive_view")} back />
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput testID="archive-search" value={q} onChangeText={setQ} placeholder={t("search")} placeholderTextColor={colors.muted} style={styles.search} />
      </View>
      {loading ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <EmptyState icon="archive-outline" message={t("empty_projects")} testID="archive-empty" />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xxl }}
          renderItem={({ item }) => (
            <Card testID={`arch-${item.id}`} onPress={() => router.push(`/project/${item.id}`)} style={styles.row}>
              <Ionicons name="business-outline" size={20} color={colors.muted} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.nazwa}</Text>
                <Text style={styles.meta}>{item.klient_nazwa || item.adres || ""}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Card>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, margin: spacing.lg, marginBottom: 0, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md },
  search: { flex: 1, color: colors.onSurface, paddingVertical: spacing.md, fontSize: font.base },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  name: { color: colors.onSurface, fontSize: font.lg, fontWeight: "700" },
  meta: { color: colors.muted, fontSize: font.base },
});
