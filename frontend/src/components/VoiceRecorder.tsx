import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Linking, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { colors, spacing, font, radius } from "@/src/theme/tokens";
import { useI18n } from "@/src/i18n/I18nContext";
import { transcribeAudio } from "@/src/api/client";
import { useToast } from "./Toast";

// Records a voice note and drops the transcript into the parent field.
export function VoiceRecorder({ onTranscribe }: { onTranscribe: (text: string) => void }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);
  const [busy, setBusy] = useState(false);
  const [perm, setPerm] = useState<boolean | null>(null);

  const ensurePermission = async (): Promise<boolean> => {
    const cur = await AudioModule.getRecordingPermissionsAsync();
    if (cur.granted) { setPerm(true); return true; }
    if (cur.canAskAgain) {
      const req = await AudioModule.requestRecordingPermissionsAsync();
      setPerm(req.granted);
      return req.granted;
    }
    setPerm(false);
    return false;
  };

  const start = async () => {
    const ok = await ensurePermission();
    if (!ok) return;
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  const stopAndTranscribe = async () => {
    setBusy(true);
    try {
      await recorder.stop();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      const uri = recorder.uri;
      if (!uri) throw new Error("no uri");
      const ext = uri.split(".").pop()?.toLowerCase() || "m4a";
      const isWeb = ext === "webm";
      const text = await transcribeAudio(
        { uri, name: `nagranie.${ext}`, type: isWeb ? "audio/webm" : "audio/m4a" },
        lang
      );
      if (text) { onTranscribe(text); toast.show(t("saved")); }
      else toast.show(t("error_generic"), "error");
    } catch {
      toast.show(t("error_generic"), "error");
    } finally {
      setBusy(false);
    }
  };

  if (perm === false) {
    return (
      <Pressable testID="voice-open-settings" style={styles.denied} onPress={() => Linking.openSettings()}>
        <Ionicons name="mic-off-outline" size={18} color={colors.error} />
        <Text style={styles.deniedText}>{t("perm_denied")} · {t("open_settings")}</Text>
      </Pressable>
    );
  }

  return (
    <View>
      <Text style={styles.hint}>{t("perm_mic")}</Text>
      <Pressable
        testID="voice-record-btn"
        onPress={state.isRecording ? stopAndTranscribe : start}
        disabled={busy}
        style={[styles.btn, state.isRecording && styles.btnRecording]}
      >
        {busy ? (
          <>
            <ActivityIndicator color={colors.brand} />
            <Text style={styles.btnText}>{t("transcribing")}</Text>
          </>
        ) : (
          <>
            <Ionicons name={state.isRecording ? "stop-circle" : "mic"} size={24} color={state.isRecording ? colors.error : colors.brand} />
            <Text style={styles.btnText}>{state.isRecording ? t("stop_recording") : t("record_voice")}</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { color: colors.muted, fontSize: font.sm, marginBottom: spacing.sm },
  btn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, borderWidth: 1,
    borderColor: colors.border, paddingVertical: spacing.lg,
  },
  btnRecording: { borderColor: colors.error, backgroundColor: colors.error + "18" },
  btnText: { color: colors.onSurface, fontSize: font.lg, fontWeight: "700" },
  denied: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md,
    backgroundColor: colors.error + "18", borderRadius: radius.md,
  },
  deniedText: { color: colors.error, fontSize: font.base, flex: 1 },
});
