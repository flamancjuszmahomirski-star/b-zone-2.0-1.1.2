import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, font, elementStatusColor } from "@/src/theme/tokens";
import { useI18n } from "@/src/i18n/I18nContext";
import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/api/client";
import { Header } from "@/src/components/Screen";
import { Card } from "@/src/components/Card";
import { Button } from "@/src/components/Button";
import { ConfirmModal } from "@/src/components/ConfirmModal";
import { useToast } from "@/src/components/Toast";
import { LoadingState, EmptyState } from "@/src/components/States";
import { formatDateTime } from "@/src/utils/format";

export default function ElementTimeline() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [el, setEl] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [unreceiveOpen, setUnreceiveOpen] = useState(false);
  const isManager = user?.rola === "admin" || user?.rola === "foreman";

  const load = useCallback(async () => {
    try { setEl(await api(`/elements/${id}`)); } catch { setEl(null); } finally { setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // H6.1: undo receipt (admin/foreman), reason required.
  const unreceive = async (reason?: string) => {
    setUnreceiveOpen(false);
    if (!reason?.trim()) { toast.show(t("reason_required"), "error"); return; }
    try {
      await api(`/projects/${el.project_id}/elements/unreceive`, { method: "POST", body: { element_ids: [el.id], powod: reason.trim() } });
      toast.show(t("saved")); load();
    } catch (e: any) { toast.show(e.message || t("error_generic"), "error"); }
  };

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
        {/* H7: every element reference leads to its place on the drawing */}
        {el.view_id ? (
          <Button
            testID="show-on-view"
            title={t("show_on_view")}
            icon="locate-outline"
            variant="secondary"
            onPress={() => router.push(`/view/${el.view_id}?focus=${el.id}`)}
          />
        ) : null}
        {isManager && el.status === "odebrany" ? (
          <Button
            testID="unreceive-btn"
            title={t("unreceive")}
            icon="arrow-undo-outline"
            variant="danger"
            onPress={() => setUnreceiveOpen(true)}
          />
        ) : null}
        <Text style={styles.section}>{t("timeline")}</Text>
        {(el.historia || []).map((h: any, i: number) => (
          <View key={h.id || i} style={styles.histRow}>
            <View style={styles.histDot} />
            <View style={{ flex: 1 }}>
              <Text style={styles.histAkcja}>{(h.akcja || "").replace(/_/g, " ")}</Text>
              <Text style={styles.histMeta}>{h.kto} · {formatDateTime(h.created_at, lang)}</Text>
              {h.report_id ? (
                <Pressable testID={`hist-report-${i}`} onPress={() => router.push(`/report/${h.report_id}`)} style={styles.reportLink}>
                  <Ionicons name="document-text-outline" size={14} color={colors.brand} />
                  <Text style={styles.reportLinkText}>{t("open_report")}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ))}
      </ScrollView>
      <ConfirmModal
        visible={unreceiveOpen}
        title={t("unreceive")}
        message={t("unreceive_confirm")}
        withReason
        reasonPlaceholder={t("reason_required")}
        confirmLabel={t("unreceive")}
        cancelLabel={t("cancel")}
        danger
        onConfirm={unreceive}
        onCancel={() => setUnreceiveOpen(false)}
      />
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
  reportLink: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  reportLinkText: { color: colors.brand, fontSize: font.sm, fontWeight: "700" },
});
