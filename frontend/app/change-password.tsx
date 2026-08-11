import React, { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { colors, spacing, font } from "@/src/theme/tokens";
import { useI18n } from "@/src/i18n/I18nContext";
import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/api/client";
import { Header } from "@/src/components/Screen";
import { TextField } from "@/src/components/TextField";
import { Button } from "@/src/components/Button";
import { useToast } from "@/src/components/Toast";

export default function ChangePassword() {
  const { t } = useI18n();
  const { user, refresh } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const forced = !!(user as any)?.must_change_password;

  const [stare, setStare] = useState("");
  const [nowe, setNowe] = useState("");
  const [powtorz, setPowtorz] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (nowe.length < 8) { toast.show(t("password_min"), "error"); return; }
    if (nowe !== powtorz) { toast.show(t("passwords_mismatch"), "error"); return; }
    if (!forced && !stare) { toast.show(t("old_password"), "error"); return; }
    setSaving(true);
    try {
      await api("/auth/change-password", { method: "POST", body: { stare: forced ? undefined : stare, nowe } });
      await refresh();
      toast.show(t("password_changed"));
      router.replace("/");
    } catch (e: any) {
      toast.show(e.message || t("error_generic"), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Header title={t("change_password")} back={!forced} />
      <KeyboardAwareScrollView
        bottomOffset={24}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingTop: forced ? insets.top + spacing.lg : spacing.lg }}
        keyboardShouldPersistTaps="handled"
      >
        {forced && (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{t("must_change_pw")}</Text>
          </View>
        )}
        {!forced && (
          <TextField testID="cp-old" label={t("old_password")} value={stare} onChangeText={setStare} secureTextEntry />
        )}
        <TextField testID="cp-new" label={t("new_password")} value={nowe} onChangeText={setNowe} secureTextEntry />
        <TextField testID="cp-repeat" label={t("new_password_repeat")} value={powtorz} onChangeText={setPowtorz} secureTextEntry />
        <Button testID="cp-submit" title={t("change_password")} onPress={submit} loading={saving} />
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  notice: { backgroundColor: colors.brandTertiary, borderRadius: 12, padding: spacing.lg, borderWidth: 1, borderColor: colors.brand },
  noticeText: { color: colors.onBrandTertiary, fontSize: font.base, fontWeight: "600" },
});
