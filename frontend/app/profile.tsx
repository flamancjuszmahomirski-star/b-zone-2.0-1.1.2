import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { colors, spacing, font, radius } from "@/src/theme/tokens";
import { useI18n } from "@/src/i18n/I18nContext";
import { useAuth } from "@/src/context/AuthContext";
import { api, uploadFile } from "@/src/api/client";
import { Header } from "@/src/components/Screen";
import { Card } from "@/src/components/Card";
import { Button } from "@/src/components/Button";
import { Avatar } from "@/src/components/Avatar";
import { TextField } from "@/src/components/TextField";
import { ConfirmModal } from "@/src/components/ConfirmModal";
import { useToast } from "@/src/components/Toast";

export default function Profile() {
  const { t, lang, setLang } = useI18n();
  const { user, setUser, logout, refresh } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();

  const [imie, setImie] = useState(user?.imie || "");
  const [nazwisko, setNazwisko] = useState(user?.nazwisko || "");
  const [telefon, setTelefon] = useState(user?.telefon || "");
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const changeAvatar = async () => {
    const cur = await ImagePicker.getMediaLibraryPermissionsAsync();
    let granted = cur.granted;
    if (!granted && cur.canAskAgain) granted = (await ImagePicker.requestMediaLibraryPermissionsAsync()).granted;
    if (!granted) { toast.show(t("perm_denied"), "error"); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.6, allowsEditing: true, aspect: [1, 1] });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    try {
      const fileObj: any = typeof window !== "undefined" && (a as any).file ? (a as any).file : { uri: a.uri, name: a.fileName || "avatar.jpg", type: a.mimeType || "image/jpeg" };
      const up = await uploadFile(fileObj, "avatar");
      const updated = await api("/auth/me", { method: "PUT", body: { avatar_url: up.url } });
      setUser(updated);
      toast.show(t("saved"));
    } catch (e: any) { toast.show(e.message || t("error_generic"), "error"); }
  };

  const save = async () => {
    setSaving(true);
    try {
      const updated = await api("/auth/me", { method: "PUT", body: { imie, nazwisko, telefon } });
      setUser(updated);
      toast.show(t("saved"));
    } catch (e: any) { toast.show(e.message || t("error_generic"), "error"); }
    finally { setSaving(false); }
  };

  const toggleLang = () => {
    const next = lang === "pl" ? "en" : "pl";
    setLang(next);
    api("/auth/me", { method: "PUT", body: { jezyk: next } }).catch(() => {});
  };

  const doLogout = async () => { await logout(); router.replace("/login"); };

  const doDeleteAccount = async () => {
    setDeleteOpen(false);
    try {
      await api("/auth/me", { method: "DELETE" });
      await logout();
      router.replace("/login");
    } catch (e: any) { toast.show(e.message || t("error_generic"), "error"); }
  };

  return (
    <View style={styles.screen}>
      <Header title={t("profile")} back />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: insets.bottom + spacing.xxl }}>
        <View style={styles.avatarRow}>
          <Avatar uri={user?.avatar_url} imie={user?.imie} nazwisko={user?.nazwisko} size={88} />
          <Pressable testID="change-avatar" onPress={changeAvatar} style={styles.changeAvatar}>
            <Ionicons name="camera" size={16} color={colors.brand} />
            <Text style={styles.changeAvatarText}>{t("change_avatar")}</Text>
          </Pressable>
          <Text style={styles.role}>{t(`role_${user?.rola}` as any)} · {user?.email}</Text>
        </View>

        <TextField testID="profile-imie" label={t("first_name")} value={imie} onChangeText={setImie} />
        <TextField testID="profile-nazwisko" label={t("last_name")} value={nazwisko} onChangeText={setNazwisko} />
        <TextField testID="profile-telefon" label={t("phone")} value={telefon} onChangeText={setTelefon} keyboardType="phone-pad" />
        <Button testID="profile-save" title={t("save")} onPress={save} loading={saving} />

        <Card style={styles.settingRow}>
          <Ionicons name="language" size={22} color={colors.brand} />
          <Text style={styles.settingLabel}>{t("language")}</Text>
          <Pressable testID="profile-lang" onPress={toggleLang} style={styles.langPill}>
            <Text style={styles.langText}>{lang.toUpperCase()}</Text>
          </Pressable>
        </Card>

        {/* B6: password change entry, all roles */}
        <Pressable testID="profile-change-password" onPress={() => router.push("/change-password")}>
          <Card style={styles.settingRow}>
            <Ionicons name="key" size={22} color={colors.brand} />
            <Text style={styles.settingLabel}>{t("change_password")}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Card>
        </Pressable>

        <Button testID="logout-btn" title={t("logout")} onPress={doLogout} variant="danger" icon="log-out-outline" />

        <Pressable testID="delete-account-btn" onPress={() => setDeleteOpen(true)} style={styles.deleteLink}>
          <Ionicons name="trash-outline" size={16} color={colors.muted} />
          <Text style={styles.deleteLinkText}>{t("delete_account")}</Text>
        </Pressable>
      </ScrollView>

      <ConfirmModal
        visible={deleteOpen}
        title={t("delete_account")}
        message={t("delete_account_confirm")}
        confirmLabel={t("delete_account")}
        cancelLabel={t("cancel")}
        danger
        onConfirm={doDeleteAccount}
        onCancel={() => setDeleteOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  avatarRow: { alignItems: "center", gap: spacing.sm },
  changeAvatar: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: spacing.xs },
  changeAvatarText: { color: colors.brand, fontSize: font.base, fontWeight: "600" },
  role: { color: colors.muted, fontSize: font.sm },
  settingRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  settingLabel: { color: colors.onSurface, fontSize: font.lg, flex: 1, fontWeight: "600" },
  langPill: { borderWidth: 1, borderColor: colors.brand, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  langText: { color: colors.brand, fontWeight: "800" },
  deleteLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: spacing.md },
  deleteLinkText: { color: colors.muted, fontSize: font.base, textDecorationLine: "underline" },
});
