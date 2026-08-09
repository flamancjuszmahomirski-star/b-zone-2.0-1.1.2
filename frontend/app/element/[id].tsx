import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useFocusEffect } from "expo-router";
import { colors, spacing, font, elementStatusColor } from "@/src/theme/tokens";
import { useI18n } from "@/src/i18n/I18nContext";
import { api } from "@/src/api/client";
import { Header } from "@/src/components/Screen";
import { Card } from "@/src/components/Card";
import { LoadingState, EmptyState } from "@/src/components/States";
import { formatDateTime } from "@/src/utils/format";

export default function ElementTimeline() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const [el, setEl] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setEl(await api(`/elements/${id}`)); } catch { setEl(null); } finally { setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <View style={styles.screen}><Header title={t("element")} back /><LoadingState /></View>;
  if (!el) return <View style={styles.screen}><Header title={t("element")} back /><EmptyState icon="cube-outline" message={t("unavailable")} /></View>;

  return (
    <View style={styles.screen}>
      <Header title={el.kod} back />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xxl }}>
        <Card style={styles.head}>
          <View style={[styles.dot, { backgroundColor: elementStatusColor(el.status) }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.kod}>{el.kod}</Text>
            <Text style={styles.status}>{t(`st_${el.status}` as any) || el.status}{el.typ ? ` · ${el.typ[lang === "pl" ? "nazwa_pl" : "nazwa_en"]}` : ""}</Text>
          </View>
        </Card>
        <Text style={styles.section}>{t("timeline")}</Text>
        {(el.historia || []).map((h: any, i: number) => (
          <View key={h.id || i} style={styles.histRow}>
            <View style={styles.histDot} />
            <View style={{ flex: 1 }}>
              <Text style={styles.histAkcja}>{(h.akcja || "").replace(/_/g, " ")}</Text>
              <Text style={styles.histMeta}>{h.kto} · {formatDateTime(h.created_at, lang)}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  dot: { width: 16, height: 16, borderRadius: 8 },
  kod: { color: colors.onSurface, fontSize: font.xxl, fontWeight: "800" },
  status: { color: colors.muted, fontSize: font.base, marginTop: 2 },
  section: { color: colors.onSurface, fontSize: font.lg, fontWeight: "700", marginTop: spacing.sm },
  histRow: { flexDirection: "row", gap: spacing.md },
  histDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brand, marginTop: 5 },
  histAkcja: { color: colors.onSurface, fontSize: font.base, fontWeight: "700", textTransform: "capitalize" },
  histMeta: { color: colors.muted, fontSize: font.sm },
});
