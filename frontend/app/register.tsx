import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { colors, spacing, font, radius } from "@/src/theme/tokens";
import { useI18n } from "@/src/i18n/I18nContext";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/components/Toast";
import { TextField } from "@/src/components/TextField";
import { Button } from "@/src/components/Button";
import { Header } from "@/src/components/Screen";
import { Ionicons } from "@expo/vector-icons";

export default function Register() {
  const { t } = useI18n();
  const { register } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [form, setForm] = useState({ imie: "", nazwisko: "", email: "", telefon: "", haslo: "" });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const onSubmit = async () => {
    if (!form.email || !form.haslo || !form.imie || !form.nazwisko) {
      toast.show(t("error_generic"), "error");
      return;
    }
    setLoading(true);
    try {
      await register({
        email: form.email.trim(),
        haslo: form.haslo,
        imie: form.imie.trim(),
        nazwisko: form.nazwisko.trim(),
        telefon: form.telefon,
      });
      setDone(true);
    } catch (e: any) {
      toast.show(e.message || t("error_generic"), "error");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <View style={styles.screen}>
        <Header title={t("register")} back />
        <View style={styles.doneWrap}>
          <View style={styles.doneIcon}>
            <Ionicons name="hourglass-outline" size={40} color={colors.brand} />
          </View>
          <Text style={styles.doneText}>{t("pending_approval")}</Text>
          <Button testID="back-to-login" title={t("login")} onPress={() => router.replace("/login")} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Header title={t("register")} back />
      <KeyboardAwareScrollView
        bottomOffset={24}
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <TextField testID="reg-imie" label={t("first_name")} value={form.imie} onChangeText={(v) => set("imie", v)} />
        <TextField testID="reg-nazwisko" label={t("last_name")} value={form.nazwisko} onChangeText={(v) => set("nazwisko", v)} />
        <TextField
          testID="reg-email"
          label={t("email")}
          value={form.email}
          onChangeText={(v) => set("email", v)}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextField testID="reg-telefon" label={`${t("phone")} (${t("optional")})`} value={form.telefon} onChangeText={(v) => set("telefon", v)} keyboardType="phone-pad" />
        <TextField testID="reg-haslo" label={t("password")} value={form.haslo} onChangeText={(v) => set("haslo", v)} secureTextEntry />
        <Button testID="reg-submit" title={t("register")} onPress={onSubmit} loading={loading} style={{ marginTop: spacing.sm }} />
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  container: { padding: spacing.xl, gap: spacing.lg },
  doneWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: spacing.lg },
  doneIcon: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: colors.surfaceSecondary,
    alignItems: "center", justifyContent: "center",
  },
  doneText: { color: colors.onSurface, fontSize: font.lg, textAlign: "center", lineHeight: 24 },
});
