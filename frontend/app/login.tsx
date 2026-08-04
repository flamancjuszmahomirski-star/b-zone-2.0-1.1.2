import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { colors, spacing, font } from "@/src/theme/tokens";
import { useI18n } from "@/src/i18n/I18nContext";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/components/Toast";
import { TextField } from "@/src/components/TextField";
import { Button } from "@/src/components/Button";
import { BrandLogo } from "@/src/components/BrandLogo";

export default function Login() {
  const { t, lang, setLang } = useI18n();
  const { login } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState("");
  const [haslo, setHaslo] = useState("");
  const [loading, setLoading] = useState(false);

  const onLogin = async () => {
    if (!email || !haslo) return;
    setLoading(true);
    try {
      await login(email.trim(), haslo);
      router.replace("/");
    } catch (e: any) {
      toast.show(e.message || t("error_generic"), "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <KeyboardAwareScrollView
        bottomOffset={24}
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + spacing.xxxl, paddingBottom: insets.bottom + spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.langRow}>
          <Pressable testID="lang-toggle" onPress={() => setLang(lang === "pl" ? "en" : "pl")} style={styles.langBtn}>
            <Text style={styles.langText}>{lang.toUpperCase()}</Text>
          </Pressable>
        </View>

        <BrandLogo />

        <View style={styles.form}>
          <TextField
            testID="login-email"
            label={t("email")}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="jan.kowalski@firma.pl"
          />
          <TextField
            testID="login-password"
            label={t("password")}
            value={haslo}
            onChangeText={setHaslo}
            secureTextEntry
            placeholder="••••••••"
          />
          <Pressable testID="forgot-link" onPress={() => router.push("/forgot")}>
            <Text style={styles.link}>{t("forgot_password")}</Text>
          </Pressable>
          <Button testID="login-submit" title={t("login")} onPress={onLogin} loading={loading} />
          <Pressable testID="to-register" onPress={() => router.push("/register")} style={styles.center}>
            <Text style={styles.linkMuted}>{t("no_account")}</Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  container: { paddingHorizontal: spacing.xl, gap: spacing.xxl, flexGrow: 1 },
  langRow: { alignItems: "flex-end" },
  langBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  langText: { color: colors.onSurface, fontWeight: "700", fontSize: font.sm },
  form: { gap: spacing.lg },
  link: { color: colors.brand, fontSize: font.base, textAlign: "right", fontWeight: "600" },
  linkMuted: { color: colors.muted, fontSize: font.base },
  center: { alignItems: "center", marginTop: spacing.sm },
});
