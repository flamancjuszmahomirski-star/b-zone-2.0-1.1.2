import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { colors, spacing, font, radius } from "@/src/theme/tokens";
import { useI18n } from "@/src/i18n/I18nContext";
import { useProjects } from "@/src/context/ProjectContext";
import { api } from "@/src/api/client";
import { Header } from "@/src/components/Screen";
import { Button } from "@/src/components/Button";
import { VoiceRecorder } from "@/src/components/VoiceRecorder";
import { PhotoStrip, Photo } from "@/src/components/PhotoStrip";
import { SelectField, SelectSheet } from "@/src/components/SelectSheet";
import { ElementPicker } from "@/src/components/ElementPicker";
import { useToast } from "@/src/components/Toast";
import { useDelayReasons } from "@/src/hooks/useDelayReasons";

export default function ReportNew() {
  const { t, lang } = useI18n();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const editing = !!edit;
  const { projects, selected } = useProjects();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const reasons = useDelayReasons();

  const [projectId, setProjectId] = useState(selected?.id || projects[0]?.id || "");
  const [opis, setOpis] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [extraHours, setExtraHours] = useState("");
  const [reasonId, setReasonId] = useState<string | null>(null);
  const [extraDesc, setExtraDesc] = useState("");
  const [projPicker, setProjPicker] = useState(false);
  const [reasonPicker, setReasonPicker] = useState(false);
  const [elSel, setElSel] = useState<Record<string, boolean>>({});
  const [elPicker, setElPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  // H6.2: edit mode — prefill from the existing report; PUT on submit.
  // (PUT updates opis/zdjecia/elementy; extra hours are managed via their own flow.)
  useEffect(() => {
    if (!edit) return;
    api(`/reports/${edit}`).then((r: any) => {
      setProjectId(r.project_id);
      setOpis(r.opis || "");
      setPhotos(r.zdjecia || []);
      const ids: string[] = r.element_ids || (r.elementy || []).map((e: any) => e.id);
      setElSel(Object.fromEntries(ids.map((i) => [i, true])));
    }).catch(() => toast.show(t("error_network"), "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit]);

  const projName = projects.find((p) => p.id === projectId)?.nazwa;
  const reasonLabel = reasons.find((r) => r.id === reasonId)?.[lang === "pl" ? "nazwa_pl" : "nazwa_en"];
  const elCount = Object.values(elSel).filter(Boolean).length;

  const chooseProject = (pid: string) => { setProjectId(pid); setElSel({}); };

  const submit = async () => {
    if (!projectId) { toast.show(t("select_project_first"), "error"); return; }
    if (!opis.trim()) { toast.show(t("description_required"), "error"); return; }
    setSaving(true);
    try {
      const body: any = {
        project_id: projectId,
        opis: opis.trim(),
        transkrypcja: opis.trim(),
        zdjecia: photos,
        element_ids: Object.keys(elSel).filter((k) => elSel[k]),
      };
      if (extraHours && parseFloat(extraHours.replace(",", "."))) {
        body.extra_godziny = {
          liczba_godzin: parseFloat(extraHours.replace(",", ".")),
          przyczyna_id: reasonId,
          opis: extraDesc,
        };
      }
      if (editing) {
        await api(`/reports/${edit}`, { method: "PUT", body });
        toast.show(t("saved"));
      } else {
        await api("/reports", { method: "POST", body });
        toast.show(t("report_submitted"));
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.back();
    } catch (e: any) {
      toast.show(e.message || t("error_network"), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Header title={editing ? t("edit_report") : t("new_report")} back />
      <KeyboardAwareScrollView
        bottomOffset={80}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        <SelectField
          testID="report-project"
          label={t("project")}
          value={projName}
          placeholder={t("select_project")}
          onPress={() => setProjPicker(true)}
        />

        <View style={styles.section}>
          <Text style={styles.label}>{t("description")}</Text>
          <VoiceRecorder onTranscribe={(text) => setOpis((prev) => (prev ? prev + " " + text : text))} />
          <TextInput
            testID="report-desc"
            value={opis}
            onChangeText={setOpis}
            placeholder={t("description")}
            placeholderTextColor={colors.muted}
            multiline
            style={styles.textArea}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>{t("photos")}</Text>
          <PhotoStrip photos={photos} onChange={setPhotos} />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>{t("completed_elements")} ({t("optional")})</Text>
          <SelectField
            testID="report-elements"
            value={elCount > 0 ? `${t("elements_selected_prefix")} ${elCount} ${t("elements_word")}` : undefined}
            placeholder={t("select_elements")}
            onPress={() => { if (projectId) setElPicker(true); else toast.show(t("select_project"), "info"); }}
          />
        </View>

        {!editing && (
        <View style={styles.section}>
          <Text style={styles.label}>{t("extra_hours")} ({t("optional")})</Text>
          <TextInput
            testID="report-extra-hours"
            value={extraHours}
            onChangeText={setExtraHours}
            keyboardType="decimal-pad"
            placeholder={t("hours_count")}
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
          {!!extraHours && (
            <>
              <SelectField
                testID="report-reason"
                value={reasonLabel}
                placeholder={t("delay_reason")}
                onPress={() => setReasonPicker(true)}
              />
              <VoiceRecorder onTranscribe={(text) => setExtraDesc((prev) => (prev ? prev + " " + text : text))} />
              <TextInput
                testID="report-extra-desc"
                value={extraDesc}
                onChangeText={setExtraDesc}
                placeholder={t("description")}
                placeholderTextColor={colors.muted}
                style={styles.input}
              />
            </>
          )}
        </View>
        )}
      </KeyboardAwareScrollView>

      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
          <Button testID="submit-report" title={editing ? t("save") : t("submit_report")} onPress={submit} loading={saving} icon={editing ? "save" : "send"} />
        </View>
      </KeyboardStickyView>

      <SelectSheet
        visible={projPicker}
        title={t("select_project")}
        options={projects.map((p) => ({ value: p.id, label: p.nazwa }))}
        selected={projectId}
        onSelect={chooseProject}
        onClose={() => setProjPicker(false)}
      />
      <SelectSheet
        visible={reasonPicker}
        title={t("delay_reason")}
        options={reasons.map((r) => ({ value: r.id, label: r[lang === "pl" ? "nazwa_pl" : "nazwa_en"] }))}
        selected={reasonId}
        onSelect={setReasonId}
        onClose={() => setReasonPicker(false)}
      />

      <ElementPicker
        visible={elPicker}
        projectId={projectId}
        selected={elSel}
        onToggle={(id) => setElSel((s) => ({ ...s, [id]: !s[id] }))}
        onClose={() => setElPicker(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  section: { gap: spacing.sm },
  label: { color: colors.onSurface, fontSize: font.lg, fontWeight: "700" },
  textArea: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1,
    borderColor: colors.border, padding: spacing.md, color: colors.onSurface,
    minHeight: 110, textAlignVertical: "top", fontSize: font.lg,
  },
  input: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1,
    borderColor: colors.border, padding: spacing.md, color: colors.onSurface, fontSize: font.lg, minHeight: 50,
  },
  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.surface },
});
