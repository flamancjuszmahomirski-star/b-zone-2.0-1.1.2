import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, TextInput, RefreshControl, KeyboardAvoidingView, Platform, Clipboard } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { colors, spacing, font, radius } from "@/src/theme/tokens";
import { useI18n } from "@/src/i18n/I18nContext";
import { api } from "@/src/api/client";
import { Header } from "@/src/components/Screen";
import { Card } from "@/src/components/Card";
import { Button } from "@/src/components/Button";
import { Avatar } from "@/src/components/Avatar";
import { SelectField, SelectSheet } from "@/src/components/SelectSheet";
import { ConfirmModal } from "@/src/components/ConfirmModal";
import { EmptyState, LoadingState } from "@/src/components/States";
import { useToast } from "@/src/components/Toast";
import { personName, isValidEmail } from "@/src/utils/validation";

export default function Users() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [tab, setTab] = useState<"pending" | "active">("pending");
  const [pending, setPending] = useState<any[]>([]);
  const [active, setActive] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [editUser, setEditUser] = useState<any>(null);
  const [role, setRole] = useState("worker");
  const [rate, setRate] = useState("0");
  const [imie, setImie] = useState("");
  const [nazwisko, setNazwisko] = useState("");
  const [email, setEmail] = useState("");
  const [telefon, setTelefon] = useState("");
  const [rolePicker, setRolePicker] = useState(false);
  const [deleteUser, setDeleteUser] = useState<any>(null);
  const [genPw, setGenPw] = useState<string | null>(null);

  const roleOptions = [
    { value: "admin", label: t("role_admin") },
    { value: "foreman", label: t("role_foreman") },
    { value: "subcontractor", label: t("role_subcontractor") },
    { value: "worker", label: t("role_worker") },
    { value: "contractor", label: t("role_contractor") },
  ];

  const load = useCallback(async () => {
    try {
      const [p, a] = await Promise.all([api<any[]>("/users/pending"), api<any[]>("/users?status=aktywny")]);
      setPending(p); setActive(a);
    } catch { setPending([]); setActive([]); } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const openEdit = (u: any, isPending: boolean) => {
    setEditUser({ ...u, isPending });
    setRole(u.rola || "worker");
    setRate(String(u.stawka_godz_eur || 0));
    setImie(u.imie || ""); setNazwisko(u.nazwisko || ""); setEmail(u.email || ""); setTelefon(u.telefon || "");
  };

  const rateRoles = ["foreman", "subcontractor", "worker"]; // roles that bill hourly (E4)

  const saveUser = async () => {
    if (!editUser) return;
    try {
      const rateNum = parseFloat(rate.replace(",", ".")) || 0;
      if (editUser.isPending) {
        await api(`/users/${editUser.id}/approve`, { method: "PATCH", body: { rola: role, stawka_godz_eur: rateNum } });
      } else {
        if (email && !isValidEmail(email)) { toast.show(t("invalid_email"), "error"); return; }
        await api(`/users/${editUser.id}`, { method: "PUT", body: {
          imie: imie.trim(), nazwisko: nazwisko.trim(), email: email.trim().toLowerCase(),
          telefon: telefon.trim(), rola: role, stawka_godz_eur: rateNum } });
      }
      setEditUser(null); toast.show(t("saved")); load();
    } catch (e: any) {
      toast.show(e?.status === 409 ? t("email_taken") : (e.message || t("error_generic")), "error");
    }
  };

  // B3: backend generates a crypto-random 16-char password and returns it once;
  // shown in a modal (not a toast) with copy + first-login-change info.
  const resetPw = async () => {
    if (!editUser) return;
    try {
      const r: any = await api(`/users/${editUser.id}/reset-password`, { method: "POST", body: {} });
      setGenPw(r.nowe);
    } catch (e: any) { toast.show(e.message || t("error_generic"), "error"); }
  };

  const copyPw = () => {
    if (!genPw) return;
    try { Clipboard.setString(genPw); toast.show(t("copied")); } catch { /* selectable text remains */ }
  };

  const reject = async (u: any) => {
    try { await api(`/users/${u.id}/reject`, { method: "PATCH" }); toast.show(t("saved")); load(); }
    catch { toast.show(t("error_generic"), "error"); }
  };
  const del = async () => {
    if (!deleteUser) return;
    try { await api(`/users/${deleteUser.id}`, { method: "DELETE" }); setDeleteUser(null); toast.show(t("saved")); load(); }
    catch { toast.show(t("error_generic"), "error"); }
  };

  const list = tab === "pending" ? pending : active;

  return (
    <View style={styles.screen}>
      <Header title={t("user_management")} back />
      <View style={styles.tabs}>
        {(["pending", "active"] as const).map((tb) => (
          <Pressable key={tb} testID={`utab-${tb}`} onPress={() => setTab(tb)} style={[styles.tab, tab === tb && styles.tabActive]}>
            <Text style={[styles.tabText, tab === tb && { color: colors.brand }]}>
              {tb === "pending" ? `${t("pending_accounts")} (${pending.length})` : t("users")}
            </Text>
          </Pressable>
        ))}
      </View>
      {loading ? (
        <LoadingState />
      ) : list.length === 0 ? (
        <EmptyState icon="people-outline" message={tab === "pending" ? t("empty_pending") : t("empty_users")} testID="users-empty" />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        >
          {list.map((u) => (
            <Card key={u.id} testID={`user-${u.id}`} style={styles.userCard}>
              <View style={styles.userRow}>
                <Avatar uri={u.avatar_url} imie={u.imie} nazwisko={u.nazwisko} size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{personName(u)}</Text>
                  <Text style={styles.meta}>{u.email}</Text>
                  {tab === "active" && (
                    <Text style={styles.roleTag}>
                      {t(`role_${u.rola}` as any)}{rateRoles.includes(u.rola) ? ` · ${u.stawka_godz_eur || 0} €/h` : ""}
                    </Text>
                  )}
                </View>
              </View>
              {tab === "pending" ? (
                <View style={styles.actions}>
                  <Button title={t("reject")} onPress={() => reject(u)} variant="secondary" style={{ flex: 1 }} testID={`reject-user-${u.id}`} />
                  <Button title={t("approve_account")} onPress={() => openEdit(u, true)} style={{ flex: 1 }} testID={`approve-user-${u.id}`} />
                </View>
              ) : (
                <View style={styles.actions}>
                  <Button title={t("edit")} onPress={() => openEdit(u, false)} variant="secondary" icon="create-outline" style={{ flex: 1 }} testID={`edit-user-${u.id}`} />
                  <Button title={t("delete")} onPress={() => setDeleteUser(u)} variant="danger" icon="trash-outline" style={{ flex: 1 }} testID={`delete-user-${u.id}`} />
                </View>
              )}
            </Card>
          ))}
        </ScrollView>
      )}

      <Modal visible={!!editUser} transparent animationType="slide" onRequestClose={() => setEditUser(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <Pressable style={styles.backdrop} onPress={() => setEditUser(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>{editUser?.isPending ? t("approve_account") : t("edit")}</Text>
            {!editUser?.isPending && (
              <>
                <View style={{ flexDirection: "row", gap: spacing.md }}>
                  <View style={{ flex: 1, gap: spacing.xs }}>
                    <Text style={styles.label}>{t("first_name")}</Text>
                    <TextInput testID="user-imie" value={imie} onChangeText={setImie} style={styles.input} placeholderTextColor={colors.muted} />
                  </View>
                  <View style={{ flex: 1, gap: spacing.xs }}>
                    <Text style={styles.label}>{t("last_name")}</Text>
                    <TextInput testID="user-nazwisko" value={nazwisko} onChangeText={setNazwisko} style={styles.input} placeholderTextColor={colors.muted} />
                  </View>
                </View>
                <View style={{ gap: spacing.xs }}>
                  <Text style={styles.label}>{t("email")}</Text>
                  <TextInput testID="user-email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" style={styles.input} placeholderTextColor={colors.muted} />
                </View>
                <View style={{ gap: spacing.xs }}>
                  <Text style={styles.label}>{t("phone")}</Text>
                  <TextInput testID="user-phone" value={telefon} onChangeText={setTelefon} keyboardType="phone-pad" style={styles.input} placeholderTextColor={colors.muted} />
                </View>
              </>
            )}
            <SelectField testID="user-role" label={t("assign_role")} value={roleOptions.find((r) => r.value === role)?.label} placeholder={t("role")} onPress={() => setRolePicker(true)} />
            {rateRoles.includes(role) && (
              <View style={{ gap: spacing.xs }}>
                <Text style={styles.label}>{t("hourly_rate")}</Text>
                <TextInput testID="user-rate" value={rate} onChangeText={setRate} keyboardType="decimal-pad" style={styles.input} placeholderTextColor={colors.muted} />
              </View>
            )}
            {!editUser?.isPending && (
              <Button title={t("reset_password")} onPress={resetPw} variant="secondary" icon="key-outline" testID="reset-pw" />
            )}
            <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.sm }}>
              <Button title={t("cancel")} onPress={() => setEditUser(null)} variant="secondary" style={{ flex: 1 }} />
              <Button title={t("save")} onPress={saveUser} style={{ flex: 1 }} testID="save-user" />
            </View>
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* B3: generated password modal */}
      <Modal visible={!!genPw} transparent animationType="fade" onRequestClose={() => setGenPw(null)}>
        <View style={styles.pwBackdrop}>
          <View style={styles.pwCard}>
            <Text style={styles.sheetTitle}>{t("generated_password")}</Text>
            <Text selectable testID="generated-pw" style={styles.pwValue}>{genPw}</Text>
            <Text style={styles.pwInfo}>{t("pw_change_on_login")}</Text>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <Button title={t("copy")} onPress={copyPw} variant="secondary" icon="copy-outline" style={{ flex: 1 }} testID="copy-pw" />
              <Button title={t("close")} onPress={() => setGenPw(null)} style={{ flex: 1 }} testID="close-pw" />
            </View>
          </View>
        </View>
      </Modal>

      <SelectSheet visible={rolePicker} title={t("assign_role")} options={roleOptions} selected={role} onSelect={setRole} onClose={() => setRolePicker(false)} />
      <ConfirmModal visible={!!deleteUser} title={t("confirm_delete")} message={deleteUser ? personName(deleteUser) : ""} confirmLabel={t("delete")} cancelLabel={t("cancel")} danger onConfirm={del} onCancel={() => setDeleteUser(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  tabs: { flexDirection: "row", paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
  tab: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  tabActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  tabText: { color: colors.muted, fontSize: font.base, fontWeight: "700" },
  userCard: { gap: spacing.md },
  userRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  name: { color: colors.onSurface, fontSize: font.lg, fontWeight: "700" },
  meta: { color: colors.muted, fontSize: font.sm },
  roleTag: { color: colors.brand, fontSize: font.sm, fontWeight: "600", marginTop: 2 },
  actions: { flexDirection: "row", gap: spacing.md },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surfaceTertiary, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.md },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: "center", marginBottom: spacing.sm },
  sheetTitle: { color: colors.onSurface, fontSize: font.xl, fontWeight: "800" },
  label: { color: colors.onSurfaceSecondary, fontSize: font.sm, fontWeight: "600" },
  input: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, color: colors.onSurface, fontSize: font.lg },
  pwBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: spacing.xl },
  pwCard: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md, borderWidth: 1, borderColor: colors.brand },
  pwValue: { color: colors.brand, fontSize: 22, fontWeight: "800", letterSpacing: 1, textAlign: "center", paddingVertical: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md },
  pwInfo: { color: colors.muted, fontSize: font.sm, textAlign: "center" },
});
