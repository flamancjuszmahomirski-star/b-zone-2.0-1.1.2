import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, Modal, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { colors, spacing, font, radius } from "@/src/theme/tokens";
import { useI18n } from "@/src/i18n/I18nContext";
import { useAuth } from "@/src/context/AuthContext";
import { useProjects } from "@/src/context/ProjectContext";
import { api } from "@/src/api/client";
import { AppBar } from "@/src/components/AppBar";
import { Card } from "@/src/components/Card";
import { Button } from "@/src/components/Button";
import { Avatar } from "@/src/components/Avatar";
import { StatusBadge } from "@/src/components/StatusBadge";
import { EmptyState, LoadingState } from "@/src/components/States";
import { useToast } from "@/src/components/Toast";
import { formatDate, todayISO, weekStart } from "@/src/utils/format";

const lastDays = (n: number) => {
  const arr: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    arr.push(d.toISOString().slice(0, 10));
  }
  return arr;
};

export default function Hours() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { selected } = useProjects();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const role = user?.rola;
  const isManager = role === "admin" || role === "foreman";

  const [date, setDate] = useState(todayISO());
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editRow, setEditRow] = useState<any>(null);
  const [editHours, setEditHours] = useState("");

  const load = useCallback(async () => {
    try {
      if (isManager) {
        if (!selected) { setRows([]); return; }
        const data = await api<any[]>(`/projects/${selected.id}/hours?data=${date}`);
        setRows(data);
      } else {
        const data = await api<any[]>(`/hours/me?month=${todayISO().slice(0, 7)}`);
        setRows(data);
      }
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [isManager, selected, date]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const approveOne = async (id: string) => {
    try { await api(`/hours/${id}/approve`, { method: "POST" }); toast.show(t("hours_approved")); load(); }
    catch (e: any) { toast.show(e.message || t("error_generic"), "error"); }
  };

  const approveDay = async () => {
    if (!selected) return;
    try {
      const r = await api<{ zatwierdzono: number }>(`/projects/${selected.id}/hours/approve-day?data=${date}`, { method: "POST" });
      toast.show(`${t("saved")} (${r.zatwierdzono})`); load();
    } catch (e: any) { toast.show(e.message || t("error_generic"), "error"); }
  };

  const approveWeek = async () => {
    if (!selected) return;
    try {
      const r = await api<{ zatwierdzono: number }>(`/projects/${selected.id}/hours/approve-week?tydzien_od=${weekStart(date)}`, { method: "POST" });
      toast.show(`${t("saved")} (${r.zatwierdzono})`); load();
    } catch (e: any) { toast.show(e.message || t("error_generic"), "error"); }
  };

  const saveCorrection = async () => {
    if (!editRow) return;
    const val = parseFloat(editHours.replace(",", "."));
    if (isNaN(val)) return;
    try {
      await api(`/hours/${editRow.id}`, { method: "PUT", body: { liczba_godzin: val, zrodlo: "korekta" } });
      setEditRow(null); toast.show(t("saved")); load();
    } catch (e: any) { toast.show(e.message || t("error_generic"), "error"); }
  };

  return (
    <View style={styles.screen}>
      <AppBar title={isManager ? t("team_hours") : t("my_hours")} showProject={isManager} />

      {isManager && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dateStripWrap} contentContainerStyle={styles.dateStrip}>
          {lastDays(10).map((d) => {
            const active = d === date;
            const dt = new Date(d);
            return (
              <Pressable key={d} testID={`date-${d}`} onPress={() => setDate(d)} style={[styles.dateChip, active && styles.dateChipActive]}>
                <Text style={[styles.dateChipDay, active && { color: "#fff" }]}>{dt.toLocaleDateString("pl-PL", { weekday: "short" })}</Text>
                <Text style={[styles.dateChipNum, active && { color: "#fff" }]}>{dt.getDate()}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {loading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState icon="time-outline" message={t("empty_hours")} testID="hours-empty" />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + (isManager ? 96 : spacing.xxl) }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        >
          {rows.map((r) => (
            <Card key={r.id} testID={`hours-${r.id}`} style={styles.row}>
              {isManager ? (
                <>
                  <Avatar uri={r.avatar_url} imie={r.imie} nazwisko={r.nazwisko} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{r.imie} {r.nazwisko}</Text>
                    <Text style={styles.sub}>{r.zrodlo}</Text>
                  </View>
                </>
              ) : (
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{r.project_nazwa}</Text>
                  <Text style={styles.sub}>{formatDate(r.data, lang)}</Text>
                </View>
              )}
              <Text style={styles.hoursVal}>{r.liczba_godzin}h</Text>
              {isManager ? (
                <View style={styles.actions}>
                  <Pressable testID={`correct-${r.id}`} onPress={() => { setEditRow(r); setEditHours(String(r.liczba_godzin)); }} hitSlop={8}>
                    <Ionicons name="create-outline" size={22} color={colors.muted} />
                  </Pressable>
                  {r.status === "naliczone" ? (
                    <Pressable testID={`approve-${r.id}`} onPress={() => approveOne(r.id)} hitSlop={8}>
                      <Ionicons name="checkmark-circle-outline" size={24} color={colors.success} />
                    </Pressable>
                  ) : (
                    <Ionicons name="checkmark-circle" size={24} color={colors.success} />
                  )}
                </View>
              ) : (
                <StatusBadge status={r.status} />
              )}
            </Card>
          ))}
        </ScrollView>
      )}

      {isManager && rows.length > 0 && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
          <Button title={t("approve_day")} onPress={approveDay} variant="secondary" style={{ flex: 1 }} testID="approve-day" />
          <Button title={t("approve_week")} onPress={approveWeek} style={{ flex: 1 }} testID="approve-week" />
        </View>
      )}

      <Modal visible={!!editRow} transparent animationType="fade" onRequestClose={() => setEditRow(null)}>
        <Pressable style={styles.backdrop} onPress={() => setEditRow(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>{t("correction")}</Text>
            <TextInput
              testID="correction-input"
              value={editHours}
              onChangeText={setEditHours}
              keyboardType="decimal-pad"
              style={styles.input}
              placeholder={t("hours_count")}
              placeholderTextColor={colors.muted}
            />
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <Button title={t("cancel")} onPress={() => setEditRow(null)} variant="secondary" style={{ flex: 1 }} />
              <Button title={t("save")} onPress={saveCorrection} style={{ flex: 1 }} testID="save-correction" />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  dateStripWrap: { maxHeight: 72, borderBottomWidth: 1, borderBottomColor: colors.divider },
  dateStrip: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  dateChip: { width: 52, height: 56, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  dateChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  dateChipDay: { color: colors.muted, fontSize: 11, textTransform: "uppercase" },
  dateChipNum: { color: colors.onSurface, fontSize: font.lg, fontWeight: "800" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  name: { color: colors.onSurface, fontSize: font.base, fontWeight: "700" },
  sub: { color: colors.muted, fontSize: font.sm },
  hoursVal: { color: colors.brand, fontSize: font.xl, fontWeight: "900" },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  footer: { flexDirection: "row", gap: spacing.md, padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.surface },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: spacing.xl },
  sheet: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.lg },
  sheetTitle: { color: colors.onSurface, fontSize: font.xl, fontWeight: "800" },
  input: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, color: colors.onSurface, fontSize: font.xl, textAlign: "center" },
});
