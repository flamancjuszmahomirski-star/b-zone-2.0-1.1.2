import React, { useState } from "react";
import { View, Text, StyleSheet, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
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
import { useToast } from "@/src/components/Toast";

export default function IssueNew() {
  const { t } = useI18n();
  const { projects, selected } = useProjects();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();

  const [projectId, setProjectId] = useState(selected?.id || projects[0]?.id || "");
  const [tytul, setTytul] = useState("");
  const [opis, setOpis] = useState("");
  const [priorytet, setPriorytet] = useState("sredni");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [projPicker, setProjPicker] = useState(false);
  const [prioPicker, setPrioPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const prios = [
    { value: "niski", label: t("priority_low") },
    { value: "sredni", label: t("priority_medium") },
    { value: "wysoki", label: t("priority_high") },
  ];

  const submit = async () => {
    if (!projectId) { toast.show(t("select_project_first"), "error"); return; }
    if (!tytul.trim()) { toast.show(t("title_required"), "error"); return; }
    if (!opis.trim()) { toast.show(t("description_required"), "error"); return; }
    setSaving(true);
    try {
      await api("/issues", { method: "POST", body: { project_id: projectId, tytul: tytul.trim(), opis: opis.trim(), priorytet, zdjecia: photos } });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.show(t("saved"));
      router.back();
    } catch (e: any) { toast.show(e.message || t("error_network"), "error"); }
    finally { setSaving(false); }
  };

  return (
    <View style={styles.screen}>
      <Header title={t("new_issue")} back />
      <KeyboardAwareScrollView bottomOffset={80} contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        <SelectField testID="issue-project" label={t("project")} value={projects.find((p) => p.id === projectId)?.nazwa} placeholder={t("select_project")} onPress={() => setProjPicker(true)} />
        <View style={{ gap: spacing.xs }}>
          <Text style={styles.label}>{t("title")}</Text>
          <TextInput testID="issue-title" value={tytul} onChangeText={setTytul} style={styles.input} placeholder={t("title")} placeholderTextColor={colors.muted} />
        </View>
        <SelectField testID="issue-priority" label={t("priority")} value={prios.find((p) => p.value === priorytet)?.label} placeholder={t("priority")} onPress={() => setPrioPicker(true)} />
        <View style={{ gap: spacing.sm }}>
          <Text style={styles.label}>{t("description")}</Text>
          <VoiceRecorder onTranscribe={(text) => setOpis((p) => (p ? p + " " + text : text))} />
          <TextInput testID="issue-desc" value={opis} onChangeText={setOpis} multiline style={styles.textArea} placeholder={t("description")} placeholderTextColor={colors.muted} />
        </View>
        <View style={{ gap: spacing.sm }}>
          <Text style={styles.label}>{t("photos")}</Text>
          <PhotoStrip photos={photos} onChange={setPhotos} />
        </View>
      </KeyboardAwareScrollView>
      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
          <Button testID="submit-issue" title={t("save")} onPress={submit} loading={saving} icon="send" />
        </View>
      </KeyboardStickyView>
      <SelectSheet visible={projPicker} title={t("select_project")} options={projects.map((p) => ({ value: p.id, label: p.nazwa }))} selected={projectId} onSelect={setProjectId} onClose={() => setProjPicker(false)} />
      <SelectSheet visible={prioPicker} title={t("priority")} options={prios} selected={priorytet} onSelect={setPriorytet} onClose={() => setPrioPicker(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  label: { color: colors.onSurface, fontSize: font.lg, fontWeight: "700" },
  input: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, color: colors.onSurface, fontSize: font.lg, minHeight: 50 },
  textArea: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, color: colors.onSurface, minHeight: 100, textAlignVertical: "top", fontSize: font.lg },
  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.surface },
});
