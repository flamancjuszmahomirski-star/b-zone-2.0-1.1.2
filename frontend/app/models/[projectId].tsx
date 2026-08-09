import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { colors, spacing, font, radius } from "@/src/theme/tokens";
import { useI18n } from "@/src/i18n/I18nContext";
import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/api/client";
import { Header } from "@/src/components/Screen";
import { Card } from "@/src/components/Card";
import { TextField } from "@/src/components/TextField";
import { Button } from "@/src/components/Button";
import { EmptyState, LoadingState } from "@/src/components/States";
import { ProgressBar } from "@/src/components/ProgressBar";
import { useToast } from "@/src/components/Toast";
import { Modal } from "react-native";

export default function Models() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { t } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const canEdit = user?.rola === "admin" || user?.rola === "foreman";

  const [folders, setFolders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    try { setFolders(await api<any[]>(`/projects/${projectId}/folders`)); }
    catch { setFolders([]); } finally { setLoading(false); }
  }, [projectId]);
  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const createFolder = async () => {
    if (!name.trim()) return;
    try {
      await api(`/projects/${projectId}/folders`, { method: "POST", body: { nazwa: name.trim() } });
      setAddOpen(false); setName(""); toast.show(t("saved")); load();
    } catch (e: any) { toast.show(e.message || t("error_generic"), "error"); }
  };

  return (
    <View style={styles.screen}>
      <Header title={t("models")} back right={canEdit ? (
        <Pressable testID="add-folder" onPress={() => setAddOpen(true)} hitSlop={8}>
          <Ionicons name="add-circle" size={28} color={colors.brand} />
        </Pressable>
      ) : undefined} />
      {loading ? (
        <LoadingState />
      ) : folders.length === 0 ? (
        <EmptyState icon="folder-open-outline" message={t("empty_folders")} testID="folders-empty" />
      ) : (
        <FlatList
          data={folders}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
          renderItem={({ item }) => (
            <Card testID={`folder-${item.id}`} onPress={() => router.push(`/folder/${item.id}`)} style={styles.card}>
              <View style={styles.row}>
                <View style={styles.iconWrap}><Ionicons name="folder" size={22} color={colors.brand} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.nazwa}</Text>
                  <Text style={styles.meta}>{item.widoki} {t("views").toLowerCase()} · {item.odebrane}/{item.elementy} {t("st_odebrany").toLowerCase()}</Text>
                </View>
                <Text style={styles.pct}>{item.procent}%</Text>
              </View>
              <ProgressBar value={item.procent} />
            </Card>
          )}
        />
      )}

      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setAddOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>{t("new_folder")}</Text>
            <TextField testID="folder-name" label={t("folder")} value={name} onChangeText={setName} />
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <Button title={t("cancel")} onPress={() => setAddOpen(false)} variant="secondary" style={{ flex: 1 }} />
              <Button title={t("save")} onPress={createFolder} style={{ flex: 1 }} testID="save-folder" />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  card: { gap: spacing.md },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconWrap: { width: 44, height: 44, borderRadius: 8, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  name: { color: colors.onSurface, fontSize: font.lg, fontWeight: "700" },
  meta: { color: colors.muted, fontSize: font.sm, marginTop: 2 },
  pct: { color: colors.brand, fontSize: font.lg, fontWeight: "900" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: spacing.xl },
  sheet: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.lg },
  sheetTitle: { color: colors.onSurface, fontSize: font.xl, fontWeight: "800" },
});
