import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, Switch } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useLocalSearchParams, useRouter } from "expo-router";
import { colors, spacing, font, radius } from "@/src/theme/tokens";
import { useI18n } from "@/src/i18n/I18nContext";
import { useProjects } from "@/src/context/ProjectContext";
import { api } from "@/src/api/client";
import { Header } from "@/src/components/Screen";
import { Button } from "@/src/components/Button";
import { TextField } from "@/src/components/TextField";
import { useToast } from "@/src/components/Toast";

const DAYS = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];

export default function ProjectForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { t } = useI18n();
  const { reload } = useProjects();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const editing = !!id;

  const [form, setForm] = useState<any>({
    nazwa: "", kod: "", klient_nazwa: "", adres: "", waluta: "EUR",
    godz_od: "07:00", godz_do: "15:00", dni_tyg: [1, 2, 3, 4, 5],
    soboty_auto: false, soboty_godziny: 8, termin: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      api(`/projects/${id}`).then((p) => setForm({ ...form, ...p })).catch(() => {});
    }
  }, [id]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const toggleDay = (d: number) => {
    const iso = d + 1;
    const has = form.dni_tyg.includes(iso);
    set("dni_tyg", has ? form.dni_tyg.filter((x: number) => x !== iso) : [...form.dni_tyg, iso]);
  };

  const submit = async () => {
    if (!form.nazwa.trim()) { toast.show(t("error_generic"), "error"); return; }
    setSaving(true);
    try {
      const body = {
        nazwa: form.nazwa, kod: form.kod, klient_nazwa: form.klient_nazwa, adres: form.adres,
        waluta: form.waluta, godz_od: form.godz_od, godz_do: form.godz_do, dni_tyg: form.dni_tyg,
        soboty_auto: form.soboty_auto, soboty_godziny: Number(form.soboty_godziny) || 0, termin: form.termin || null,
      };
      if (editing) await api(`/projects/${id}`, { method: "PUT", body });
      else await api("/projects", { method: "POST", body });
      await reload();
      toast.show(t("saved"));
      router.back();
    } catch (e: any) { toast.show(e.message || t("error_network"), "error"); }
    finally { setSaving(false); }
  };

  return (
    <View style={styles.screen}>
      <Header title={editing ? t("edit_project") : t("new_project")} back />
      <KeyboardAwareScrollView bottomOffset={80} contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        <TextField testID="pf-nazwa" label={t("project_name")} value={form.nazwa} onChangeText={(v) => set("nazwa", v)} />
        <TextField testID="pf-kod" label={t("project_code")} value={form.kod} onChangeText={(v) => set("kod", v)} />
        <TextField testID="pf-klient" label={t("client_name")} value={form.klient_nazwa} onChangeText={(v) => set("klient_nazwa", v)} />
        <TextField testID="pf-adres" label={t("address")} value={form.adres} onChangeText={(v) => set("adres", v)} hint="np. Berlin, Germany" />
        <View style={styles.timeRow}>
          <View style={{ flex: 1 }}><TextField testID="pf-godzod" label={`${t("work_hours_label")} od`} value={form.godz_od} onChangeText={(v) => set("godz_od", v)} placeholder="07:00" /></View>
          <View style={{ flex: 1 }}><TextField testID="pf-godzdo" label="do" value={form.godz_do} onChangeText={(v) => set("godz_do", v)} placeholder="15:00" /></View>
        </View>
        <View style={{ gap: spacing.sm }}>
          <Text style={styles.label}>{t("work_hours_label")}</Text>
          <View style={styles.days}>
            {DAYS.map((d, i) => {
              const active = form.dni_tyg.includes(i + 1);
              return (
                <Pressable key={d} testID={`day-${i}`} onPress={() => toggleDay(i)} style={[styles.day, active && styles.dayActive]}>
                  <Text style={[styles.dayText, active && { color: "#fff" }]}>{d}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.label}>{t("saturdays_auto")}</Text>
          <Switch testID="pf-soboty" value={form.soboty_auto} onValueChange={(v) => set("soboty_auto", v)} trackColor={{ true: colors.brand }} />
        </View>
        {form.soboty_auto && (
          <TextField testID="pf-soboty-godz" label={`${t("saturdays_auto")} - ${t("hours_count")}`} value={String(form.soboty_godziny)} onChangeText={(v) => set("soboty_godziny", v)} keyboardType="decimal-pad" />
        )}
      </KeyboardAwareScrollView>
      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
          <Button testID="pf-submit" title={t("save")} onPress={submit} loading={saving} />
        </View>
      </KeyboardStickyView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  label: { color: colors.onSurface, fontSize: font.base, fontWeight: "700" },
  timeRow: { flexDirection: "row", gap: spacing.md },
  days: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  day: { width: 42, height: 42, borderRadius: radius.sm, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  dayActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  dayText: { color: colors.muted, fontWeight: "700" },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.surface },
});
