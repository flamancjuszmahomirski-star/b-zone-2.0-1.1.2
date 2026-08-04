import React, { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { colors, spacing, font, radius } from "@/src/theme/tokens";
import { useI18n } from "@/src/i18n/I18nContext";
import { api } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";
import { TextField } from "@/src/components/TextField";
import { Button } from "@/src/components/Button";
import { Header } from "@/src/components/Screen";

export default function Forgot() {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [newPass, setNewPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<"request" | "confirm">("request");

  const onRequest = async () => {
    if (!email) return;
    setLoading(true);
    try {
      const res = await api<{ reset_token?: string }>("/auth/password-reset/request", {
        method: "POST",
        body: { email: email.trim() },
        retries: 0,
      });
      if (res.reset_token) setToken(res.reset_token);
      setStage("confirm");
      toast.show(t("reset_token_info"), "info");
    } catch (e: any) {
      toast.show(e.message || t("error_generic"), "error");
    } finally {
      setLoading(false);
    }
  };

  const onConfirm = async () => {
    if (!token || !newPass) return;
    setLoading(true);
    try {
      await api("/auth/password-reset/confirm", {
        method: "POST",
        body: { token: token.trim(), nowe_haslo: newPass },
        retries: 0,
      });
      toast.show(t("saved"), "success");
      router.replace("/login");
    } catch (e: any) {
      toast.show(e.message || t("error_generic"), "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Header title={t("reset_password")} back />
      <KeyboardAwareScrollView
        bottomOffset={24}
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        {stage === "request" ? (
          <>
            <TextField
              testID="forgot-email"
              label={t("email")}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <Button testID="forgot-request" title={t("reset_password")} onPress={onRequest} loading={loading} />
          </>
        ) : (
          <>
            <TextField testID="forgot-token" label={t("reset_token")} value={token} onChangeText={setToken} autoCapitalize="none" />
            <TextField testID="forgot-newpass" label={t("new_password")} value={newPass} onChangeText={setNewPass} secureTextEntry />
            <Button testID="forgot-confirm" title={t("save")} onPress={onConfirm} loading={loading} />
          </>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  container: { padding: spacing.xl, gap: spacing.lg },
});
