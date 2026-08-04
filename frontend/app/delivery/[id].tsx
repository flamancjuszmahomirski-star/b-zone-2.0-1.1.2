import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { colors, spacing, font, radius } from "@/src/theme/tokens";
import { useI18n } from "@/src/i18n/I18nContext";
import { useAuth } from "@/src/context/AuthContext";
import { api, fileUrl } from "@/src/api/client";
import { Header } from "@/src/components/Screen";
import { Card } from "@/src/components/Card";
import { Button } from "@/src/components/Button";
import { StatusBadge } from "@/src/components/StatusBadge";
import { LoadingState, EmptyState, ErrorState } from "@/src/components/States";
import { useToast } from "@/src/components/Toast";
import { formatDate } from "@/src/utils/format";

export default function DeliveryDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const isManager = user?.rola === "admin" || user?.rola === "foreman";

  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errState, setErrState] = useState<null | "notfound" | "network">(null);

  const load = useCallback(async () => {
    setErrState(null);
    try { setD(await api(`/deliveries/${id}`)); }
    catch (e: any) { setD(null); setErrState(e?.status === 404 ? "notfound" : "network"); }
    finally { setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const setStatus = async (status: string) => {
    try { await api(`/deliveries/${id}/status`, { method: "PATCH", body: { status } }); toast.show(t("saved")); load(); }
    catch (e: any) { toast.show(e.message || t("error_generic"), "error"); }
  };

  if (loading) return <View style={styles.screen}><Header title={t("delivery")} back /><LoadingState /></View>;
  if (errState === "network") return <View style={styles.screen}><Header title={t("delivery")} back /><ErrorState message={t("error_network")} onRetry={load} retryLabel={t("retry")} /></View>;
  if (!d) return <View style={styles.screen}><Header title={t("delivery")} back /><EmptyState icon="cube-outline" message={t("unavailable")} /></View>;

  return (
    <View style={styles.screen}>
      <Header title={t("delivery")} back right={<StatusBadge status={d.status} />} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + 100 }}>
        <Row icon="business-outline" label={t("project")} value={d.project_nazwa || "—"} />
        <Row icon="person-outline" label={t("author")} value={d.autor || "—"} />
        <Row icon="calendar-outline" label={t("planned_date")} value={d.data_planowana ? formatDate(d.data_planowana, lang) : "—"} />

        <View style={{ gap: spacing.xs }}>
          <Text style={styles.sectionLabel}>{t("description")}</Text>
          <Card><Text style={styles.desc}>{d.opis || "—"}</Text></Card>
        </View>

        {!!d.transkrypcja && d.transkrypcja !== d.opis && (
          <View style={{ gap: spacing.xs }}>
            <Text style={styles.sectionLabel}>{t("transcription")}</Text>
            <Card><Text style={styles.desc}>{d.transkrypcja}</Text></Card>
          </View>
        )}

        <View style={{ gap: spacing.xs }}>
          <Text style={styles.sectionLabel}>{t("attachment")}</Text>
          {d.zalacznik_url ? (
            <Pressable testID="download-attachment" onPress={() => Linking.openURL(fileUrl(d.zalacznik_url)!)} style={styles.attach}>
              <Ionicons name="document-attach" size={22} color={colors.brand} />
              <Text style={styles.attachText} numberOfLines={1}>{d.zalacznik_nazwa || t("attachment")}</Text>
              <Ionicons name="download-outline" size={20} color={colors.muted} />
            </Pressable>
          ) : (
            <Card><Text style={styles.desc}>—</Text></Card>
          )}
        </View>
      </ScrollView>

      {isManager && d.status === "awizowana" && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
          <Button title={t("reject_delivery")} onPress={() => setStatus("odrzucona")} variant="danger" style={{ flex: 1 }} testID="reject-delivery" />
          <Button title={t("confirm_delivery")} onPress={() => setStatus("potwierdzona")} style={{ flex: 1 }} testID="confirm-delivery" />
        </View>
      )}
    </View>
  );
}

function Row({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={18} color={colors.muted} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  infoRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  infoLabel: { color: colors.muted, fontSize: font.base, width: 96 },
  infoValue: { color: colors.onSurface, fontSize: font.base, fontWeight: "600", flex: 1, textAlign: "right" },
  sectionLabel: { color: colors.onSurfaceSecondary, fontSize: font.sm, fontWeight: "700" },
  desc: { color: colors.onSurface, fontSize: font.lg, lineHeight: 24 },
  attach: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  attachText: { color: colors.onSurface, fontSize: font.base, flex: 1, fontWeight: "600" },
  footer: { flexDirection: "row", gap: spacing.md, padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.surface },
});
