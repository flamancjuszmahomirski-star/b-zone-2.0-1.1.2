import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { colors, spacing, font, radius } from "@/src/theme/tokens";
import { useI18n } from "@/src/i18n/I18nContext";
import { api } from "@/src/api/client";
import { Header } from "@/src/components/Screen";
import { Card } from "@/src/components/Card";
import { TextField } from "@/src/components/TextField";
import { Button } from "@/src/components/Button";
import { EmptyState, LoadingState } from "@/src/components/States";
import { useToast } from "@/src/components/Toast";

const COLORS = ["#F97316", "#3B82F6", "#10B981", "#A855F7", "#EAB308", "#EF4444"];

export default function ElementTypes() {
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [pl, setPl] = useState("");
  const [en, setEn] = useState("");
  const [kolor, setKolor] = useState(COLORS[0]);

  const load = useCallback(async () => {
    try { setItems(await api<any[]>("/element-types")); } catch { setItems([]); } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const open = (it: any) => { setEdit(it || {}); setPl(it?.nazwa_pl || ""); setEn(it?.nazwa_en || ""); setKolor(it?.kolor || COLORS[0]); };

  const save = async () => {
    if (!pl.trim() || !en.trim()) { toast.show(t("error_generic"), "error"); return; }
    try {
      const body = { nazwa_pl: pl.trim(), nazwa_en: en.trim(), kolor, aktywny: true };
      if (edit?.id) await api(`/element-types/${edit.id}`, { method: "PUT", body });
      else await api("/element-types", { method: "POST", body });
      setEdit(null); toast.show(t("saved")); load();
    } catch (e: any) { toast.show(e.message || t("error_generic"), "error"); }
  };

  const remove = async (it: any) => {
    try { await api(`/element-types/${it.id}`, { method: "DELETE" }); toast.show(t("saved")); load(); }
    catch { toast.show(t("error_generic"), "error"); }
  };

  return (
    <View style={styles.screen}>
      <Header title={t("element_types")} back right={
        <Pressable testID="add-type" onPress={() => open(null)} hitSlop={8}><Ionicons name="add-circle" size={28} color={colors.brand} /></Pressable>
      } />
      {loading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState icon="pricetags-outline" message="—" testID="types-empty" />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        >
          {items.map((it) => (
            <Card key={it.id} testID={`type-${it.id}`} style={styles.row}>
              <View style={[styles.swatch, { backgroundColor: it.kolor }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{it.nazwa_pl}</Text>
                <Text style={styles.meta}>{it.nazwa_en}</Text>
              </View>
              <Pressable testID={`edit-type-${it.id}`} onPress={() => open(it)} hitSlop={8}><Ionicons name="create-outline" size={22} color={colors.muted} /></Pressable>
              <Pressable testID={`del-type-${it.id}`} onPress={() => remove(it)} hitSlop={8}><Ionicons name="trash-outline" size={22} color={colors.error} /></Pressable>
            </Card>
          ))}
        </ScrollView>
      )}

      <Modal visible={!!edit} transparent animationType="fade" onRequestClose={() => setEdit(null)}>
        <Pressable style={styles.backdrop} onPress={() => setEdit(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>{t("element_type")}</Text>
            <TextField testID="type-pl" label="PL" value={pl} onChangeText={setPl} />
            <TextField testID="type-en" label="EN" value={en} onChangeText={setEn} />
            <View style={styles.colors}>
              {COLORS.map((c) => (
                <Pressable key={c} testID={`color-${c}`} onPress={() => setKolor(c)} style={[styles.colorDot, { backgroundColor: c, borderColor: kolor === c ? "#fff" : "transparent" }]} />
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <Button title={t("cancel")} onPress={() => setEdit(null)} variant="secondary" style={{ flex: 1 }} />
              <Button title={t("save")} onPress={save} style={{ flex: 1 }} testID="save-type" />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  swatch: { width: 28, height: 28, borderRadius: 6 },
  name: { color: colors.onSurface, fontSize: font.lg, fontWeight: "700" },
  meta: { color: colors.muted, fontSize: font.sm },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: spacing.xl },
  sheet: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.lg },
  sheetTitle: { color: colors.onSurface, fontSize: font.xl, fontWeight: "800" },
  colors: { flexDirection: "row", gap: spacing.md, flexWrap: "wrap" },
  colorDot: { width: 36, height: 36, borderRadius: 18, borderWidth: 3 },
});
