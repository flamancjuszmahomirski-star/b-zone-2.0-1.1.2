import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useFocusEffect } from "expo-router";
import { colors, spacing, font, radius, elementStatusColor } from "@/src/theme/tokens";
import { useI18n } from "@/src/i18n/I18nContext";
import { api } from "@/src/api/client";
import { Header } from "@/src/components/Screen";
import { Card } from "@/src/components/Card";
import { TextField } from "@/src/components/TextField";
import { Button } from "@/src/components/Button";
import { EmptyState, LoadingState } from "@/src/components/States";
import { useToast } from "@/src/components/Toast";

export default function FixDuplicates() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [newKod, setNewKod] = useState("");

  const load = useCallback(async () => {
    try { setGroups(await api<any[]>(`/projects/${projectId}/elements/duplicates`)); }
    catch { setGroups([]); } finally { setLoading(false); }
  }, [projectId]);
  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const openRename = (el: any) => { setEdit(el); setNewKod(el.kod); };

  const save = async () => {
    if (!newKod.trim()) return;
    try {
      await api(`/elements/${edit.id}`, { method: "PUT", body: { kod: newKod.trim() } });
      setEdit(null); toast.show(t("saved")); load();
    } catch (e: any) {
      toast.show(e?.status === 409 ? t("code_taken") : (e.message || t("error_generic")), "error");
    }
  };

  return (
    <View style={styles.screen}>
      <Header title={t("fix_duplicates")} back />
      {loading ? (
        <LoadingState />
      ) : groups.length === 0 ? (
        <EmptyState icon="checkmark-circle-outline" message={t("no_duplicates")} testID="dups-empty" />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: insets.bottom + spacing.xxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        >
          {groups.map((g) => (
            <View key={g.kod} style={{ gap: spacing.sm }}>
              <Text style={styles.groupTitle}>{g.kod} · {g.count}×</Text>
              {g.elementy.map((el: any) => (
                <Card key={el.id} testID={`dup-${el.id}`} style={styles.row}>
                  <View style={[styles.dot, { backgroundColor: elementStatusColor(el.status) }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.kod}>{el.kod}</Text>
                    <Text style={styles.meta}>{el.widok_nazwa}</Text>
                  </View>
                  <Pressable testID={`rename-${el.id}`} onPress={() => openRename(el)} hitSlop={8} style={styles.renameBtn}>
                    <Ionicons name="create-outline" size={18} color={colors.brand} />
                    <Text style={styles.renameText}>{t("rename")}</Text>
                  </Pressable>
                </Card>
              ))}
            </View>
          ))}
        </ScrollView>
      )}

      <Modal visible={!!edit} transparent animationType="fade" onRequestClose={() => setEdit(null)}>
        <Pressable style={styles.backdrop} onPress={() => setEdit(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>{t("rename")}</Text>
            <TextField testID="dup-new-kod" label={t("code")} value={newKod} onChangeText={setNewKod} autoCapitalize="characters" />
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <Button title={t("cancel")} onPress={() => setEdit(null)} variant="secondary" style={{ flex: 1 }} />
              <Button title={t("save")} onPress={save} style={{ flex: 1 }} testID="dup-save" />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  groupTitle: { color: colors.error, fontSize: font.base, fontWeight: "800" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  dot: { width: 12, height: 12, borderRadius: 6 },
  kod: { color: colors.onSurface, fontSize: font.lg, fontWeight: "700" },
  meta: { color: colors.muted, fontSize: font.sm },
  renameBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.brand },
  renameText: { color: colors.brand, fontSize: font.sm, fontWeight: "700" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: spacing.xl },
  sheet: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.lg },
  sheetTitle: { color: colors.onSurface, fontSize: font.xl, fontWeight: "800" },
});
