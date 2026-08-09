import React, { useState, useCallback, useEffect } from "react";
import { View, Text, StyleSheet, Modal, Pressable, FlatList, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, font, radius, elementStatusColor } from "@/src/theme/tokens";
import { useI18n } from "@/src/i18n/I18nContext";
import { api, fileUrl } from "@/src/api/client";
import { Button } from "@/src/components/Button";
import { EmptyState, LoadingState } from "@/src/components/States";

const SCREEN = Dimensions.get("window");

type Props = {
  visible: boolean;
  projectId: string;
  selected: Record<string, boolean>;
  onToggle: (id: string) => void;
  onClose: () => void;
};

export function ElementPicker({ visible, projectId, selected, onToggle, onClose }: Props) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<"list" | "view">("list");
  const [loading, setLoading] = useState(false);

  const [elements, setElements] = useState<any[]>([]);

  const [level, setLevel] = useState<"folders" | "views" | "canvas">("folders");
  const [folders, setFolders] = useState<any[]>([]);
  const [views, setViews] = useState<any[]>([]);
  const [view, setView] = useState<any>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api<any[]>(`/projects/${projectId}/elements`);
      setElements(rows.filter((e) => e.status !== "odebrany"));
    } catch { setElements([]); } finally { setLoading(false); }
  }, [projectId]);

  const loadFolders = useCallback(async () => {
    setLoading(true);
    try { setFolders(await api<any[]>(`/projects/${projectId}/folders`)); }
    catch { setFolders([]); } finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => {
    if (!visible) return;
    if (tab === "list") loadList();
    else { setLevel("folders"); loadFolders(); }
  }, [visible, tab, loadList, loadFolders]);

  const openFolder = async (f: any) => {
    setLoading(true);
    try { setViews(await api<any[]>(`/folders/${f.id}/views`)); setLevel("views"); }
    catch { setViews([]); } finally { setLoading(false); }
  };
  const openView = async (v: any) => {
    setLoading(true);
    try { const full = await api<any>(`/views/${v.id}`); setView(full); setLevel("canvas"); }
    catch { /* ignore */ } finally { setLoading(false); }
  };

  const selCount = Object.values(selected).filter(Boolean).length;

  const baseW = SCREEN.width - spacing.lg * 2;
  const canvasAspect = view?.szerokosc && view?.wysokosc ? view.wysokosc / view.szerokosc : 0.75;
  const baseH = baseW * canvasAspect;

  const back = () => {
    if (level === "canvas") { setView(null); setLevel("views"); }
    else if (level === "views") { setViews([]); setLevel("folders"); }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.head}>
          <Pressable testID="picker-close" onPress={onClose} hitSlop={8} style={styles.headBtn}>
            <Ionicons name="close" size={26} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.title}>{t("completed_elements")}</Text>
          <View style={styles.headBtn} />
        </View>

        <View style={styles.tabs}>
          <Pressable testID="picker-tab-list" onPress={() => setTab("list")} style={[styles.tab, tab === "list" && styles.tabActive]}>
            <Ionicons name="list" size={16} color={tab === "list" ? colors.brand : colors.muted} />
            <Text style={[styles.tabText, tab === "list" && { color: colors.brand }]}>{t("select_elements")}</Text>
          </Pressable>
          <Pressable testID="picker-tab-view" onPress={() => setTab("view")} style={[styles.tab, tab === "view" && styles.tabActive]}>
            <Ionicons name="image" size={16} color={tab === "view" ? colors.brand : colors.muted} />
            <Text style={[styles.tabText, tab === "view" && { color: colors.brand }]}>{t("view")}</Text>
          </Pressable>
        </View>

        {loading ? (
          <LoadingState />
        ) : tab === "list" ? (
          elements.length === 0 ? (
            <EmptyState icon="cube-outline" message={t("empty_elements")} testID="picker-list-empty" />
          ) : (
            <FlatList
              data={elements}
              keyExtractor={(i) => i.id}
              contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 120 }}
              renderItem={({ item }) => (
                <Pressable testID={`pick-el-${item.id}`} onPress={() => onToggle(item.id)} style={[styles.listRow, selected[item.id] && styles.listRowSel]}>
                  <Ionicons name={selected[item.id] ? "checkbox" : "square-outline"} size={22} color={selected[item.id] ? colors.brand : colors.muted} />
                  <Text style={styles.kod}>{item.kod}</Text>
                  <View style={[styles.dot, { backgroundColor: elementStatusColor(item.status) }]} />
                </Pressable>
              )}
            />
          )
        ) : (
          <View style={{ flex: 1 }}>
            {level !== "folders" && (
              <Pressable testID="picker-back" onPress={back} style={styles.crumb}>
                <Ionicons name="chevron-back" size={18} color={colors.brand} />
                <Text style={styles.crumbText}>{t("cancel")}</Text>
              </Pressable>
            )}
            {level === "folders" && (
              folders.length === 0 ? (
                <EmptyState icon="folder-open-outline" message={t("empty_folders")} testID="picker-folders-empty" />
              ) : (
                <FlatList
                  data={folders}
                  keyExtractor={(i) => i.id}
                  contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 120 }}
                  renderItem={({ item }) => (
                    <Pressable testID={`pick-folder-${item.id}`} onPress={() => openFolder(item)} style={styles.navRow}>
                      <Ionicons name="folder" size={20} color={colors.brand} />
                      <Text style={styles.navText}>{item.nazwa}</Text>
                      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                    </Pressable>
                  )}
                />
              )
            )}
            {level === "views" && (
              views.length === 0 ? (
                <EmptyState icon="image-outline" message={t("empty_views")} testID="picker-views-empty" />
              ) : (
                <FlatList
                  data={views}
                  keyExtractor={(i) => i.id}
                  contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 120 }}
                  renderItem={({ item }) => (
                    <Pressable testID={`pick-view-${item.id}`} onPress={() => openView(item)} style={styles.navRow}>
                      <Ionicons name="image" size={20} color={colors.brand} />
                      <Text style={styles.navText}>{item.nazwa}</Text>
                      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                    </Pressable>
                  )}
                />
              )
            )}
            {level === "canvas" && view && (
              <View style={{ padding: spacing.lg }}>
                <Text style={styles.hint}>{t("select_elements")}</Text>
                <View style={{ width: baseW, height: baseH, backgroundColor: "#0A0A0A", borderRadius: radius.md, overflow: "hidden", marginTop: spacing.sm }}>
                  <Image source={{ uri: fileUrl(view.plik_url) }} style={{ width: baseW, height: baseH }} contentFit="contain" />
                  {(view.elementy || []).map((el: any) => {
                    const received = el.status === "odebrany";
                    const isSel = selected[el.id];
                    return (
                      <Pressable
                        key={el.id}
                        testID={`pick-marker-${el.id}`}
                        onPress={() => { if (!received) onToggle(el.id); }}
                        style={[styles.marker, {
                          left: el.pozycja_x * baseW - 13, top: el.pozycja_y * baseH - 13,
                          backgroundColor: received ? colors.muted : elementStatusColor(el.status),
                          borderColor: isSel ? "#fff" : "rgba(0,0,0,0.4)", borderWidth: isSel ? 3 : 1,
                          opacity: received ? 0.5 : 1,
                        }]}
                      >
                        <Text style={styles.markerText} numberOfLines={1}>{el.kod}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        )}

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
          <Button testID="picker-done" title={`${t("save")} (${selCount})`} onPress={onClose} icon="checkmark" />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  headBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { color: colors.onSurface, fontSize: font.xl, fontWeight: "800" },
  tabs: { flexDirection: "row", paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  tabActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  tabText: { color: colors.muted, fontSize: font.base, fontWeight: "700" },
  listRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  listRowSel: { borderColor: colors.brand },
  kod: { color: colors.onSurface, fontSize: font.lg, fontWeight: "700", flex: 1 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  navRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  navText: { color: colors.onSurface, fontSize: font.lg, fontWeight: "600", flex: 1 },
  crumb: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  crumbText: { color: colors.brand, fontSize: font.base, fontWeight: "700" },
  hint: { color: colors.muted, fontSize: font.sm },
  marker: { position: "absolute", minWidth: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  markerText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.surface },
});
