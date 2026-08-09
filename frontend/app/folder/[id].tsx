import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl, Modal, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { colors, spacing, font, radius } from "@/src/theme/tokens";
import { useI18n } from "@/src/i18n/I18nContext";
import { useAuth } from "@/src/context/AuthContext";
import { api, uploadFile, fileUrl } from "@/src/api/client";
import { Header } from "@/src/components/Screen";
import { Card } from "@/src/components/Card";
import { TextField } from "@/src/components/TextField";
import { Button } from "@/src/components/Button";
import { EmptyState, LoadingState } from "@/src/components/States";
import { useToast } from "@/src/components/Toast";

export default function Folder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const canEdit = user?.rola === "admin" || user?.rola === "foreman";

  const [views, setViews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [pic, setPic] = useState<{ url: string; w?: number; h?: number } | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try { setViews(await api<any[]>(`/folders/${id}/views`)); }
    catch { setViews([]); } finally { setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const pickImage = async () => {
    const cur = await ImagePicker.getMediaLibraryPermissionsAsync();
    let granted = cur.granted;
    if (!granted && cur.canAskAgain) granted = (await ImagePicker.requestMediaLibraryPermissionsAsync()).granted;
    if (!granted) { toast.show(t("perm_denied"), "error"); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    setUploading(true);
    try {
      const fileObj: any = typeof window !== "undefined" && (a as any).file ? (a as any).file : { uri: a.uri, name: a.fileName || "rysunek.jpg", type: a.mimeType || "image/jpeg" };
      const up = await uploadFile(fileObj, "view_drawing");
      setPic({ url: up.url, w: a.width, h: a.height });
      toast.show(t("saved"));
    } catch { toast.show(t("error_generic"), "error"); }
    finally { setUploading(false); }
  };

  const createView = async () => {
    if (!name.trim() || !pic) { toast.show(t("error_generic"), "error"); return; }
    try {
      await api(`/folders/${id}/views`, { method: "POST", body: { nazwa: name.trim(), plik_url: pic.url, plik_typ: "image", szerokosc: pic.w, wysokosc: pic.h } });
      setAddOpen(false); setName(""); setPic(null); toast.show(t("saved")); load();
    } catch (e: any) { toast.show(e.message || t("error_generic"), "error"); }
  };

  return (
    <View style={styles.screen}>
      <Header title={t("views")} back right={canEdit ? (
        <Pressable testID="add-view" onPress={() => setAddOpen(true)} hitSlop={8}>
          <Ionicons name="add-circle" size={28} color={colors.brand} />
        </Pressable>
      ) : undefined} />
      {loading ? (
        <LoadingState />
      ) : views.length === 0 ? (
        <EmptyState icon="image-outline" message={t("empty_views")} testID="views-empty" />
      ) : (
        <FlatList
          data={views}
          keyExtractor={(i) => i.id}
          numColumns={2}
          columnWrapperStyle={{ gap: spacing.md }}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
          renderItem={({ item }) => (
            <Pressable testID={`view-${item.id}`} onPress={() => router.push(`/view/${item.id}`)} style={styles.viewCard}>
              <Image source={{ uri: fileUrl(item.plik_url) }} style={styles.viewImg} contentFit="cover" />
              <View style={styles.viewInfo}>
                <Text style={styles.viewName} numberOfLines={1}>{item.nazwa}</Text>
                <Text style={styles.viewMeta}>{item.odebrane}/{item.elementy}</Text>
              </View>
            </Pressable>
          )}
        />
      )}

      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setAddOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>{t("new_view")}</Text>
            <TextField testID="view-name" label={t("view")} value={name} onChangeText={setName} />
            <Pressable testID="view-pick" onPress={pickImage} style={styles.upload} disabled={uploading}>
              {uploading ? <ActivityIndicator color={colors.brand} /> : pic ? (
                <Image source={{ uri: fileUrl(pic.url) }} style={styles.preview} contentFit="cover" />
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={26} color={colors.brand} />
                  <Text style={styles.uploadText}>{t("upload_drawing")}</Text>
                </>
              )}
            </Pressable>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <Button title={t("cancel")} onPress={() => setAddOpen(false)} variant="secondary" style={{ flex: 1 }} />
              <Button title={t("save")} onPress={createView} style={{ flex: 1 }} testID="save-view" />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  viewCard: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  viewImg: { width: "100%", height: 120, backgroundColor: colors.surfaceTertiary },
  viewInfo: { padding: spacing.md },
  viewName: { color: colors.onSurface, fontSize: font.base, fontWeight: "700" },
  viewMeta: { color: colors.muted, fontSize: font.sm },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: spacing.xl },
  sheet: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.lg },
  sheetTitle: { color: colors.onSurface, fontSize: font.xl, fontWeight: "800" },
  upload: { height: 140, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, overflow: "hidden" },
  uploadText: { color: colors.brand, fontSize: font.base, fontWeight: "600" },
  preview: { width: "100%", height: "100%" },
});
