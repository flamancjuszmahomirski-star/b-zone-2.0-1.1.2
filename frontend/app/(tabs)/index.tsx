import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { colors, spacing, font, radius } from "@/src/theme/tokens";
import { useI18n } from "@/src/i18n/I18nContext";
import { useAuth } from "@/src/context/AuthContext";
import { useProjects } from "@/src/context/ProjectContext";
import { api } from "@/src/api/client";
import { AppBar } from "@/src/components/AppBar";
import { Card } from "@/src/components/Card";
import { Button } from "@/src/components/Button";
import { Avatar } from "@/src/components/Avatar";
import { EmptyState, LoadingState } from "@/src/components/States";
import { todayISO } from "@/src/utils/format";

function Metric({
  icon,
  value,
  label,
  onPress,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: number | string;
  label: string;
  onPress?: () => void;
  testID?: string;
}) {
  return (
    <Card onPress={onPress} testID={testID} style={styles.metric}>
      <Ionicons name={icon} size={22} color={colors.brand} />
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel} numberOfLines={2}>{label}</Text>
    </Card>
  );
}

export default function Dashboard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { selected, projects } = useProjects();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const role = user?.rola;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<any>({});

  const load = useCallback(async () => {
    try {
      const today = todayISO();
      if (role === "admin") {
        const [pending, reports, issues] = await Promise.all([
          api("/users/pending"),
          api("/reports?status=wyslany"),
          api("/issues"),
        ]);
        setData({
          pending: pending.length,
          reportsToApprove: reports.length,
          openIssues: issues.filter((i: any) => i.status === "otwarte").length,
        });
      } else if (role === "foreman") {
        if (selected) {
          const [hours, reports, issues] = await Promise.all([
            api(`/projects/${selected.id}/hours?data=${today}`),
            api(`/reports?project_id=${selected.id}&status=wyslany`),
            api(`/issues?project_id=${selected.id}`),
          ]);
          setData({
            crew: hours,
            reportsToApprove: reports.length,
            openIssues: issues.filter((i: any) => i.status === "otwarte").length,
          });
        }
      } else if (role === "worker" || role === "subcontractor") {
        const [hours, issues] = await Promise.all([
          api(`/hours/me?month=${today.slice(0, 7)}`),
          api(`/issues?mine=true`),
        ]);
        const todayHours = hours.filter((h: any) => h.data === today);
        setData({
          todayHours: todayHours.reduce((s: number, h: any) => s + (h.liczba_godzin || 0), 0),
          myIssues: issues.length,
        });
      } else if (role === "contractor") {
        const deliveries = await api("/deliveries?mine=true");
        setData({ deliveries: deliveries.length });
      }
    } catch {
      setData({});
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

  const greeting = `${t("today")} · ${new Date().toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" })}`;

  return (
    <View style={styles.screen}>
      <AppBar title={`${user?.imie || ""} 👋`} showProject={role !== "admin"} />
      {loading ? (
        <LoadingState />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxl, gap: spacing.lg }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        >
          <Text style={styles.greeting}>{greeting}</Text>

          {/* ADMIN */}
          {role === "admin" && (
            <>
              <View style={styles.grid}>
                <Metric testID="metric-projects" icon="business" value={projects.length} label={t("active_projects")} onPress={() => router.push("/projects")} />
                <Metric testID="metric-pending" icon="person-add" value={data.pending || 0} label={t("pending_accounts")} onPress={() => router.push("/users")} />
                <Metric testID="metric-reports" icon="document-text" value={data.reportsToApprove || 0} label={t("reports_to_approve")} onPress={() => router.push("/(tabs)/reports")} />
                <Metric testID="metric-issues" icon="alert-circle" value={data.openIssues || 0} label={t("open_issues")} onPress={() => router.push("/(tabs)/issues")} />
              </View>
              <Text style={styles.sectionTitle}>{t("active_projects")}</Text>
              {projects.length === 0 ? (
                <EmptyState icon="business-outline" message={t("empty_projects")} />
              ) : (
                projects.map((p) => (
                  <Card key={p.id} testID={`project-card-${p.id}`} onPress={() => router.push(`/project/${p.id}`)} style={styles.projCard}>
                    <View style={styles.projTop}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.projName}>{p.nazwa}</Text>
                        <Text style={styles.projMeta}>{p.klient_nazwa || p.adres || ""}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={colors.muted} />
                    </View>
                    <View style={styles.projStats}>
                      <View style={styles.statChip}>
                        <Ionicons name="people" size={14} color={colors.muted} />
                        <Text style={styles.statChipText}>{p.liczba_czlonkow || 0}</Text>
                      </View>
                    </View>
                  </Card>
                ))
              )}
              <Button title={t("new_project")} icon="add" onPress={() => router.push("/project-form")} variant="secondary" testID="new-project-btn" />
            </>
          )}

          {/* FOREMAN */}
          {role === "foreman" && (
            <>
              {!selected ? (
                <EmptyState icon="business-outline" message={t("empty_projects")} />
              ) : (
                <>
                  <View style={styles.grid}>
                    <Metric testID="metric-crew" icon="people" value={(data.crew || []).length} label={t("people_today")} onPress={() => router.push("/(tabs)/hours")} />
                    <Metric testID="metric-reports" icon="document-text" value={data.reportsToApprove || 0} label={t("reports_to_approve")} onPress={() => router.push("/(tabs)/reports")} />
                    <Metric testID="metric-issues" icon="alert-circle" value={data.openIssues || 0} label={t("open_issues")} onPress={() => router.push("/(tabs)/issues")} />
                    <Metric testID="metric-deliveries" icon="cube" value={t("deliveries")} label="" onPress={() => router.push("/deliveries")} />
                  </View>
                  <Button title={t("new_report")} icon="add-circle" onPress={() => router.push("/report-new")} testID="foreman-new-report" />
                  <Text style={styles.sectionTitle}>{t("who_on_site")}</Text>
                  {(data.crew || []).length === 0 ? (
                    <EmptyState icon="people-outline" message={t("empty_hours")} />
                  ) : (
                    (data.crew || []).map((c: any) => (
                      <Card key={c.id} style={styles.crewRow}>
                        <Avatar uri={c.avatar_url} imie={c.imie} nazwisko={c.nazwisko} size={36} />
                        <Text style={styles.crewName}>{c.imie} {c.nazwisko}</Text>
                        <Text style={styles.crewHours}>{c.liczba_godzin}h</Text>
                      </Card>
                    ))
                  )}
                </>
              )}
            </>
          )}

          {/* WORKER / SUBCONTRACTOR */}
          {(role === "worker" || role === "subcontractor") && (
            <>
              <Card style={styles.heroCard}>
                <Text style={styles.heroLabel}>{t("my_hours_today")}</Text>
                <Text style={styles.heroValue}>{data.todayHours || 0}h</Text>
              </Card>
              <Button title={t("new_report")} icon="add-circle" onPress={() => router.push("/report-new")} testID="new-report-btn" />
              <View style={styles.grid}>
                <Metric testID="metric-myissues" icon="alert-circle" value={data.myIssues || 0} label={t("issues")} onPress={() => router.push("/(tabs)/issues")} />
                <Metric testID="metric-myhours" icon="time" value={t("my_hours")} label="" onPress={() => router.push("/(tabs)/hours")} />
              </View>
            </>
          )}

          {/* CONTRACTOR */}
          {role === "contractor" && (
            <>
              {!selected ? (
                <EmptyState icon="business-outline" message={t("empty_projects")} />
              ) : (
                <Card testID="contractor-project" onPress={() => router.push(`/project/${selected.id}`)} style={styles.projCard}>
                  <Text style={styles.projName}>{selected.nazwa}</Text>
                  <Text style={styles.projMeta}>{selected.adres}</Text>
                  <View style={styles.scheduleBox}>
                    <Ionicons name="calendar-outline" size={16} color={colors.muted} />
                    <Text style={styles.projMeta}>{t("schedule_soon")}</Text>
                  </View>
                </Card>
              )}
              <Button title={t("new_delivery")} icon="cube" onPress={() => router.push("/delivery-new")} testID="new-delivery-btn" />
              <Metric testID="metric-deliveries" icon="cube" value={data.deliveries || 0} label={t("deliveries")} onPress={() => router.push("/deliveries")} />
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  greeting: { color: colors.muted, fontSize: font.base, textTransform: "capitalize" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  metric: { width: "47.5%", gap: spacing.xs, minHeight: 96, justifyContent: "center" },
  metricValue: { color: colors.onSurface, fontSize: font.xxxl, fontWeight: "900" },
  metricLabel: { color: colors.muted, fontSize: font.sm },
  sectionTitle: { color: colors.onSurface, fontSize: font.lg, fontWeight: "800", marginTop: spacing.sm },
  projCard: { gap: spacing.sm },
  projTop: { flexDirection: "row", alignItems: "center" },
  projName: { color: colors.onSurface, fontSize: font.lg, fontWeight: "700" },
  projMeta: { color: colors.muted, fontSize: font.base, marginTop: 2 },
  projStats: { flexDirection: "row", gap: spacing.sm },
  statChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.surfaceTertiary, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  statChipText: { color: colors.onSurfaceSecondary, fontSize: font.sm, fontWeight: "700" },
  crewRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  crewName: { color: colors.onSurface, fontSize: font.base, fontWeight: "600", flex: 1 },
  crewHours: { color: colors.brand, fontSize: font.lg, fontWeight: "800" },
  heroCard: { backgroundColor: colors.brandTertiary, borderColor: colors.brandSecondary, gap: spacing.xs },
  heroLabel: { color: colors.onBrandTertiary, fontSize: font.base, fontWeight: "600" },
  heroValue: { color: "#fff", fontSize: 44, fontWeight: "900" },
  scheduleBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
});
