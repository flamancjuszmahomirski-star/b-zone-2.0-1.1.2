import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { colors, spacing, font, radius } from "@/src/theme/tokens";
import { useI18n } from "@/src/i18n/I18nContext";
import { useAuth } from "@/src/context/AuthContext";
import { useProjects } from "@/src/context/ProjectContext";
import { api } from "@/src/api/client";
import { Header } from "@/src/components/Screen";
import { Card } from "@/src/components/Card";
import { Button } from "@/src/components/Button";
import { Avatar } from "@/src/components/Avatar";
import { LoadingState, EmptyState } from "@/src/components/States";
import { SelectSheet } from "@/src/components/SelectSheet";
import { ConfirmModal } from "@/src/components/ConfirmModal";
import { useToast } from "@/src/components/Toast";
import { formatDate } from "@/src/utils/format";

export default function ProjectDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { reload } = useProjects();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const isAdmin = user?.rola === "admin";

  const [project, setProject] = useState<any>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "team" | "reports">("overview");
  const [addMember, setAddMember] = useState(false);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, r] = await Promise.all([api(`/projects/${id}`), api(`/reports?project_id=${id}`)]);
      setProject(p); setReports(r);
    } catch { setProject(null); } finally { setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openAddMember = async () => {
    try { setAllUsers(await api<any[]>("/users?status=aktywny")); setAddMember(true); }
    catch { toast.show(t("error_generic"), "error"); }
  };
  const addUser = async (uid: string) => {
    try { await api(`/projects/${id}/members`, { method: "POST", body: { user_id: uid, jest_glowny: false } }); toast.show(t("saved")); load(); }
    catch (e: any) { toast.show(e.message || t("error_generic"), "error"); }
  };
  const removeMember = async (uid: string) => {
    try { await api(`/projects/${id}/members/${uid}`, { method: "DELETE" }); toast.show(t("saved")); load(); }
    catch { toast.show(t("error_generic"), "error"); }
  };
  const archive = async () => {
    setArchiveOpen(false);
    try { await api(`/projects/${id}/archive`, { method: "PATCH" }); await reload(); toast.show(t("saved")); router.back(); }
    catch { toast.show(t("error_generic"), "error"); }
  };

  if (loading) return <View style={styles.screen}><Header title={t("project")} back /><LoadingState /></View>;
  if (!project) return <View style={styles.screen}><Header title={t("project")} back /></View>;

  const memberIds = (project.czlonkowie || []).map((m: any) => m.user_id);
  const availableUsers = allUsers.filter((u) => !memberIds.includes(u.id) && u.rola !== "contractor");

  const tabs: { key: any; label: string }[] = [
    { key: "overview", label: t("overview") },
    ...(isAdmin ? [{ key: "team" as const, label: t("members") }] : []),
    { key: "reports", label: t("reports") },
  ];

  return (
    <View style={styles.screen}>
      <Header title={project.nazwa} back right={isAdmin ? (
        <Pressable testID="project-edit" onPress={() => router.push(`/project-form?id=${id}`)} hitSlop={8}>
          <Ionicons name="create-outline" size={24} color={colors.brand} />
        </Pressable>
      ) : undefined} />

      <View style={styles.tabs}>
        {tabs.map((tb) => (
          <Pressable key={tb.key} testID={`ptab-${tb.key}`} onPress={() => setTab(tb.key)} style={[styles.tab, tab === tb.key && styles.tabActive]}>
            <Text style={[styles.tabText, tab === tb.key && { color: colors.brand }]}>{tb.label}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + 100 }}>
        {tab === "overview" && (
          <>
            <Card style={{ gap: spacing.sm }}>
              <Row icon="pricetag-outline" label={t("project_code")} value={project.kod || "—"} />
              <Row icon="person-outline" label={t("client_name")} value={project.klient_nazwa || "—"} />
              <Row icon="location-outline" label={t("address")} value={project.adres || "—"} />
              <Row icon="time-outline" label={t("work_hours_label")} value={`${project.godz_od}–${project.godz_do}`} />
              <Row icon="calendar-outline" label={t("deadline")} value={project.termin ? formatDate(project.termin, lang) : "—"} />
            </Card>

            <Pressable testID="models-tile" onPress={() => router.push(`/models/${id}`)} style={styles.modelsTile}>
              <View style={styles.modelsHead}>
                <View style={styles.modelsIcon}><Ionicons name="grid-outline" size={20} color={colors.brand} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modelsTitle}>{t("models")}</Text>
                  <Text style={styles.modelsMeta}>
                    {project.modele_summary?.odebrane || 0}/{project.modele_summary?.elementy || 0} · {project.modele_summary?.foldery || 0} {t("folders").toLowerCase()}
                  </Text>
                </View>
                <Text style={styles.modelsPct}>{project.modele_summary?.procent || 0}%</Text>
              </View>
              <ProgressBar value={project.modele_summary?.procent || 0} />
            </Pressable>

            {(user?.rola === "admin" || user?.rola === "foreman") && (
              <Button testID="open-receipts" title={t("receipts")} icon="checkmark-circle-outline" variant="secondary" onPress={() => router.push(`/receipts/${id}`)} />
            )}

            {user?.rola === "contractor" && (
              <Card style={styles.schedule}>
                <Ionicons name="calendar-outline" size={18} color={colors.muted} />
                <Text style={styles.scheduleText}>{t("schedule_soon")}</Text>
              </Card>
            )}
          </>
        )}

        {tab === "team" && isAdmin && (
          <>
            {(project.czlonkowie || []).length === 0 ? (
              <EmptyState icon="people-outline" message={t("empty_users")} />
            ) : (
              (project.czlonkowie || []).map((m: any) => (
                <Card key={m.user_id} style={styles.memberRow}>
                  <Avatar uri={m.avatar_url} imie={m.imie} nazwisko={m.nazwisko} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberName}>{m.imie} {m.nazwisko}</Text>
                    <Text style={styles.memberRole}>{t(`role_${m.rola}` as any)}</Text>
                  </View>
                  <Pressable testID={`remove-member-${m.user_id}`} onPress={() => removeMember(m.user_id)} hitSlop={8}>
                    <Ionicons name="close-circle" size={22} color={colors.error} />
                  </Pressable>
                </Card>
              ))
            )}
            <Button testID="add-member" title={t("add")} icon="person-add" onPress={openAddMember} variant="secondary" />
          </>
        )}

        {tab === "reports" && (
          reports.length === 0 ? (
            <EmptyState icon="document-text-outline" message={t("empty_reports")} />
          ) : (
            reports.map((r) => (
              <Card key={r.id} testID={`pr-report-${r.id}`} onPress={() => router.push(`/report/${r.id}`)} style={styles.reportRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName} numberOfLines={1}>{r.opis || "—"}</Text>
                  <Text style={styles.memberRole}>{r.autor} · {formatDate(r.data, lang)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Card>
            ))
          )
        )}
      </ScrollView>

      {isAdmin && project.status === "aktywny" && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
          <Button testID="project-archive" title={t("archive")} onPress={() => setArchiveOpen(true)} variant="danger" icon="archive-outline" />
        </View>
      )}

      <SelectSheet visible={addMember} title={t("assignments")} options={availableUsers.map((u) => ({ value: u.id, label: `${u.imie} ${u.nazwisko} (${t(`role_${u.rola}` as any)})` }))} onSelect={addUser} onClose={() => setAddMember(false)} />
      <ConfirmModal visible={archiveOpen} title={t("confirm_archive")} confirmLabel={t("archive")} cancelLabel={t("cancel")} danger onConfirm={archive} onCancel={() => setArchiveOpen(false)} />
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
  tabs: { flexDirection: "row", paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
  tab: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  tabActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  tabText: { color: colors.muted, fontSize: font.base, fontWeight: "700" },
  infoRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  infoLabel: { color: colors.muted, fontSize: font.base, width: 90 },
  infoValue: { color: colors.onSurface, fontSize: font.base, fontWeight: "600", flex: 1, textAlign: "right" },
  schedule: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  scheduleText: { color: colors.muted, fontSize: font.base },
  memberRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  memberName: { color: colors.onSurface, fontSize: font.base, fontWeight: "700" },
  memberRole: { color: colors.muted, fontSize: font.sm },
  reportRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.surface },
});
