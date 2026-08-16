import React, { useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import { colors, spacing, font, radius } from "@/src/theme/tokens";
import { useI18n } from "@/src/i18n/I18nContext";
import { useProjects } from "@/src/context/ProjectContext";
import { api, uploadFile } from "@/src/api/client";
import { Header } from "@/src/components/Screen";
import { Button } from "@/src/components/Button";
import { VoiceRecorder } from "@/src/components/VoiceRecorder";
import { SelectField, SelectSheet } from "@/src/components/SelectSheet";
import { useToast } from "@/src/components/Toast";

export default function DeliveryNew() {
  const { t } = useI18n();
  const { projects, selected } = useProjects();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();

  const [projectId, setProjectId] = useState(selected?.id || projects[0]?.id || "");
  const [opis, setOpis] = useState("");
  const [dataPlan, setDataPlan] = useState("");
  const [attachment, setAttachment] = useState<{ url: string; name: string } | null>(null);
  const [projPicker, setProjPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const pickDoc = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    setUploading(true);
    try {
      const fileObj: any =
        typeof window !== "undefined" && (a as any).file
          ? (a as any).file
          : { uri: a.uri, name: a.name, type: a.mimeType || "application/pdf" };
      const up = await uploadFile(fileObj, "delivery_document");
      setAttachment({ url: up.url, name: up.name });
      toast.show(t("saved"));
    } catch (e: any) { toast.show(e.message || t("error_generic"), "error"); }
    finally { setUploading(false); }
  };

  const submit = async () => {
    if (!projectId || !opis.trim()) { toast.show(t("error_generic"), "error"); return; }
    setSaving(true);
    try {
      await api("/deliveries", {
        method: "POST",
        body: { project_id: projectId, opis: opis.trim(), transkrypcja: opis.trim(), data_planowana: dataPlan || null, zalacznik_url: attachment?.url, zalacznik_nazwa: attachment?.name },
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.show(t("saved"));
      router.back();
    } catch (e: any) { toast.show(e.message || t("error_network"), "error"); }
    finally { setSaving(false); }
  };

  return (
    <View style={styles.screen}>
      <Header title={t("new_delivery")} back />
      <KeyboardAwareScrollView bottomOffset={80} contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        <SelectField testID="delivery-project" label={t("project")} value={projects.find((p) => p.id === projectId)?.nazwa} placeholder={t("select_project")} onPress={() => setProjPicker(true)} />
        <View style={{ gap: spacing.sm }}>
          <Text style={styles.label}>{t("description")}</Text>
          <VoiceRecorder onTranscribe={(text) => setOpis((p) => (p ? p + " " + text : text))} />
          <TextInput testID="delivery-desc" value={opis} onChangeText={setOpis} multiline style={styles.textArea} placeholder={t("description")} placeholderTextColor={colors.muted} />
        </View>
        <View style={{ gap: spacing.xs }}>
          <Text style={styles.label}>{t("planned_date")}</Text>
          <TextInput testID="delivery-date" value={dataPlan} onChangeText={setDataPlan} style={styles.input} placeholder="2026-08-15" placeholderTextColor={colors.muted} />
        </View>
        <View style={{ gap: spacing.sm }}>
          <Text style={styles.label}>{t("attachment")}</Text>
          <Pressable testID="delivery-attach" onPress={pickDoc} style={styles.attach} disabled={uploading}>
            <Ionicons name={attachment ? "document-attach" : "cloud-upload-outline"} size={22} color={colors.brand} />
            <Text style={styles.attachText} numberOfLines={1}>{attachment?.name || (uploading ? t("saving") : t("add_attachment"))}</Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>
      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
          <Button testID="submit-delivery" title={t("save")} onPress={submit} loading={saving} icon="send" />
        </View>
      </KeyboardStickyView>
      <SelectSheet visible={projPicker} title={t("select_project")} options={projects.map((p) => ({ value: p.id, label: p.nazwa }))} selected={projectId} onSelect={setProjectId} onClose={() => setProjPicker(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  label: { color: colors.onSurface, fontSize: font.lg, fontWeight: "700" },
  input: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, color: colors.onSurface, fontSize: font.lg, minHeight: 50 },
  textArea: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, color: colors.onSurface, minHeight: 100, textAlignVertical: "top", fontSize: font.lg },
  attach: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, borderStyle: "dashed", padding: spacing.lg },
  attachText: { color: colors.onSurfaceSecondary, fontSize: font.base, flex: 1 },
  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.surface },
});
