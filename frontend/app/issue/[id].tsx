import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
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
import { LoadingState } from "@/src/components/States";
import { SelectSheet } from "@/src/components/SelectSheet";
import { ConfirmModal } from "@/src/components/ConfirmModal";
import { useToast } from "@/src/components/Toast";
import { formatDateTime } from "@/src/utils/format";

export default function IssueDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const isManager = user?.rola === "admin" || user?.rola === "foreman";

  const [issue, setIssue] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [statusPicker, setStatusPicker] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = useCallback(async () => {
    try { setIssue(await api(`/issues/${id}`)); } catch { setIssue(null); } finally { setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const statuses = [
    { value: "w_trakcie", label: "W trakcie / In progress" },
    { value: "rozwiazane", label: "Rozwiązane / Resolved" },
    { value: "odrzucone", label: "Odrzucone / Rejected" },
  ];

  const applyStatus = async (status: string, reason?: string) => {
    try {
      await api(`/issues/${id}/status`, { method: "PATCH", body: { status, powod: reason || "" } });
      toast.show(t("saved")); setPendingStatus(null); load();
    } catch (e: any) { toast.show(e.message || t("error_generic"), "error"); }
  };

  const onSelectStatus = (status: string) => {
    if (status === "rozwiazane" || status === "odrzucone") setPendingStatus(status);
    else applyStatus(status);
  };

  const del = async () => {
    setDeleteOpen(false);
    try { await api(`/issues/${id}`, { method: "DELETE" }); toast.show(t("saved")); router.back(); }
    catch (e: any) { toast.show(e.message || t("error_generic"), "error"); }
  };

  if (loading) return <View style={styles.screen}><Header title={t("issue")} back /><LoadingState /></View>;
  if (!issue) return <View style={styles.screen}><Header title={t("issue")} back /></View>;
  const canDelete = issue.user_id === user?.id || user?.rola === "admin";

  return (
    <View style={styles.screen}>
      <Header title={t("issue")} back right={<StatusBadge status={issue.status} />} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: insets.bottom + 100 }}>
        <Text style={styles.title}>{issue.tytul}</Text>
        <Text style={styles.meta}>{issue.project_nazwa} · {issue.autor}</Text>
        <Card><Text style={styles.desc}>{issue.opis}</Text></Card>

        {issue.zdjecia?.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
            {issue.zdjecia.map((p: any, i: number) => (
              <Image key={i} source={{ uri: fileUrl(p.url) }} style={styles.photo} contentFit="cover" />
            ))}
          </ScrollView>
        )}

        <Text style={styles.sectionTitle}>{t("status_history")}</Text>
        {(issue.historia_statusow || []).map((h: any, i: number) => (
          <View key={i} style={styles.histRow}>
            <View style={styles.histDot} />
            <View style={{ flex: 1 }}>
              <Text style={styles.histStatus}>{h.status}</Text>
              {h.powod ? <Text style={styles.histReason}>{h.powod}</Text> : null}
              <Text style={styles.histTime}>{formatDateTime(h.kiedy, lang)}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      {(isManager || canDelete) && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
          {isManager && <Button title={t("change_status")} onPress={() => setStatusPicker(true)} style={{ flex: 1 }} testID="change-status" />}
          {canDelete && <Button title={t("delete")} onPress={() => setDeleteOpen(true)} variant="danger" style={{ flex: isManager ? 0 : 1, minWidth: 100 }} testID="delete-issue" />}
        </View>
      )}

      <SelectSheet visible={statusPicker} title={t("change_status")} options={statuses} selected={issue.status} onSelect={onSelectStatus} onClose={() => setStatusPicker(false)} />
      <ConfirmModal
        visible={!!pendingStatus}
        title={t("change_status")}
        withReason
        reasonPlaceholder={t("reason_required")}
        confirmLabel={t("confirm")}
        cancelLabel={t("cancel")}
        onConfirm={(reason) => applyStatus(pendingStatus!, reason)}
        onCancel={() => setPendingStatus(null)}
      />
      <ConfirmModal visible={deleteOpen} title={t("confirm_delete")} confirmLabel={t("delete")} cancelLabel={t("cancel")} danger onConfirm={del} onCancel={() => setDeleteOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  title: { color: colors.onSurface, fontSize: font.xxl, fontWeight: "800" },
  meta: { color: colors.muted, fontSize: font.base },
  desc: { color: colors.onSurface, fontSize: font.lg, lineHeight: 24 },
  sectionTitle: { color: colors.onSurface, fontSize: font.lg, fontWeight: "700", marginTop: spacing.sm },
  photo: { width: 120, height: 120, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  histRow: { flexDirection: "row", gap: spacing.md },
  histDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brand, marginTop: 6 },
  histStatus: { color: colors.onSurface, fontSize: font.base, fontWeight: "700", textTransform: "capitalize" },
  histReason: { color: colors.onSurfaceSecondary, fontSize: font.base },
  histTime: { color: colors.muted, fontSize: font.sm },
  footer: { flexDirection: "row", gap: spacing.md, padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.surface },
});
