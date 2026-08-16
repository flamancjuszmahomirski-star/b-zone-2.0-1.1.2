import React, { useState, useCallback, useRef } from "react";
import { View, Text, StyleSheet, Pressable, Modal, TextInput, ScrollView, ActivityIndicator, Dimensions, KeyboardAvoidingView } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from "react-native-reanimated";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { colors, spacing, font, radius, elementStatusColor } from "@/src/theme/tokens";
import { useI18n } from "@/src/i18n/I18nContext";
import { useAuth } from "@/src/context/AuthContext";
import { api, fileUrl } from "@/src/api/client";
import { Header } from "@/src/components/Screen";
import { Button } from "@/src/components/Button";
import { SelectField, SelectSheet } from "@/src/components/SelectSheet";
import { LoadingState } from "@/src/components/States";
import { ConfirmModal } from "@/src/components/ConfirmModal";
import { useToast } from "@/src/components/Toast";
import { useDelayReasons } from "@/src/hooks/useDelayReasons";

const SCREEN = Dimensions.get("window");

export default function ViewCanvas() {
  const { id, focus } = useLocalSearchParams<{ id: string; focus?: string }>();
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const canEdit = user?.rola === "admin" || user?.rola === "foreman";

  const [view, setView] = useState<any>(null);
  const [elements, setElements] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"view" | "edit" | "receive">("view");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [detail, setDetail] = useState<any>(null);
  const [typePicker, setTypePicker] = useState(false);
  // A1: lost/unloadable background image → clear message instead of a black canvas.
  const [imgError, setImgError] = useState(false);
  // H7: element highlighted via ?focus= param.
  const [focusId, setFocusId] = useState<string | null>(null);

  // add/series form
  const [pendingPos, setPendingPos] = useState<{ x: number; y: number } | null>(null);
  const [kod, setKod] = useState("");
  const [typId, setTypId] = useState<string | null>(null);
  const [series, setSeries] = useState(false);
  const [prefix, setPrefix] = useState("");
  const [nextNum, setNextNum] = useState(1);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const stx = useSharedValue(0);
  const sty = useSharedValue(0);

  const baseW = SCREEN.width;
  const [baseH, setBaseH] = useState(SCREEN.width * 0.75);

  const load = useCallback(async () => {
    try {
      const [v, ty2] = await Promise.all([api(`/views/${id}`), api("/element-types")]);
      setView(v); setElements(v.elementy || []); setTypes(ty2);
      const bh = v.szerokosc && v.wysokosc ? SCREEN.width * (v.wysokosc / v.szerokosc) : SCREEN.width * 0.75;
      if (v.szerokosc && v.wysokosc) setBaseH(bh);
      // H7: center + zoom on the focused element, highlight it and open its detail.
      if (focus) {
        const fel = (v.elementy || []).find((e: any) => e.id === focus);
        if (fel) {
          setFocusId(fel.id);
          const s = 2;
          const txv = s * (SCREEN.width / 2 - fel.pozycja_x * SCREEN.width);
          const tyv = s * (bh / 2 - fel.pozycja_y * bh);
          scale.value = withTiming(s); savedScale.value = s;
          tx.value = withTiming(txv); stx.value = txv;
          ty.value = withTiming(tyv); sty.value = tyv;
          setDetail(fel);
        }
      }
    } catch { setView(null); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, focus]);
  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const addAt = (relX: number, relY: number) => {
    if (mode !== "edit") return;
    if (series) {
      // Series: skip any codes already taken (whole-range guard) before saving.
      let n = nextNum;
      const existing = new Set(elements.map((e) => e.kod));
      while (existing.has(`${prefix}${n}`)) n += 1;
      const code = `${prefix}${n}`;
      api(`/views/${id}/elements`, { method: "POST", body: { kod: code, typ_id: typId, opis: "", pozycja_x: relX, pozycja_y: relY } })
        .then((el) => { setElements((p) => [...p, el]); setNextNum(n + 1); })
        .catch((e) => toast.show(e?.status === 409 ? t("code_taken") : (e.message || t("error_generic")), "error"));
    } else {
      setPendingPos({ x: relX, y: relY }); setKod("");
    }
  };

  const saveElement = async () => {
    if (!pendingPos || !kod.trim()) return;
    try {
      const el = await api(`/views/${id}/elements`, { method: "POST", body: { kod: kod.trim(), typ_id: typId, opis: "", pozycja_x: pendingPos.x, pozycja_y: pendingPos.y } });
      setElements((p) => [...p, el]); setPendingPos(null); setKod(""); toast.show(t("saved"));
    } catch (e: any) { toast.show(e?.status === 409 ? t("code_taken") : (e.message || t("error_generic")), "error"); }
  };

  const tapGesture = Gesture.Tap().maxDuration(250).onEnd((e) => {
    const relX = e.x / baseW;
    const relY = e.y / baseH;
    if (relX >= 0 && relX <= 1 && relY >= 0 && relY <= 1) runOnJS(addAt)(relX, relY);
  });
  const pinch = Gesture.Pinch()
    .onUpdate((e) => { scale.value = Math.max(1, Math.min(4, savedScale.value * e.scale)); })
    .onEnd(() => { savedScale.value = scale.value; if (scale.value <= 1) { scale.value = withTiming(1); tx.value = withTiming(0); ty.value = withTiming(0); stx.value = 0; sty.value = 0; } });
  const pan = Gesture.Pan().minPointers(scale.value > 1 ? 1 : 2)
    .onUpdate((e) => { tx.value = stx.value + e.translationX; ty.value = sty.value + e.translationY; })
    .onEnd(() => { stx.value = tx.value; sty.value = ty.value; });
  const composed = Gesture.Simultaneous(pinch, pan, tapGesture);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  const onMarkerPress = (el: any) => {
    if (mode === "receive") {
      if (el.status !== "zgloszony_gotowy") { toast.show(t("st_zgloszony_gotowy"), "info"); return; }
      setSelected((s) => ({ ...s, [el.id]: !s[el.id] }));
    } else {
      setDetail(el);
    }
  };

  const receiveSelected = async () => {
    const ids = Object.keys(selected).filter((k) => selected[k]);
    if (!ids.length) return;
    try {
      const r = await api<{ odebrano: number }>(`/projects/${view.project_id}/elements/receive`, { method: "POST", body: { element_ids: ids } });
      toast.show(`${t("receive")}: ${r.odebrano}`); setSelected({}); setMode("view"); load();
    } catch (e: any) { toast.show(e.message || t("error_generic"), "error"); }
  };

  const deleteElement = async () => {
    if (!detail) return;
    try { const r: any = await api(`/elements/${detail.id}`, { method: "DELETE" }); toast.show(r.message || t("saved")); setDetail(null); load(); }
    catch (e: any) { toast.show(e.message || t("error_generic"), "error"); }
  };

  if (loading) return <View style={styles.screen}><Header title={t("view")} back /><LoadingState /></View>;
  if (!view) return <View style={styles.screen}><Header title={t("view")} back /></View>;

  const counts = {
    todo: elements.filter((e) => e.status === "do_wykonania").length,
    ready: elements.filter((e) => e.status === "zgloszony_gotowy").length,
    recv: elements.filter((e) => e.status === "odebrany").length,
  };
  const selCount = Object.values(selected).filter(Boolean).length;

  return (
    <View style={styles.screen}>
      <Header title={view.nazwa} back right={canEdit ? (
        <Pressable testID="toggle-edit" onPress={() => { setMode(mode === "edit" ? "view" : "edit"); setSeries(false); }} hitSlop={8}>
          <Ionicons name={mode === "edit" ? "checkmark-done" : "create-outline"} size={24} color={mode === "edit" ? colors.success : colors.brand} />
        </Pressable>
      ) : undefined} />

      <View style={styles.legend}>
        <Legend color={colors.muted} label={`${t("st_do_wykonania")} ${counts.todo}`} />
        <Legend color={colors.warning} label={`${t("st_zgloszony_gotowy")} ${counts.ready}`} />
        <Legend color={colors.success} label={`${t("st_odebrany")} ${counts.recv}`} />
      </View>

      <View style={styles.canvasWrap}>
        <GestureDetector gesture={composed}>
          <Animated.View style={[{ width: baseW, height: baseH }, animStyle]}>
            {imgError ? (
              <View style={[styles.imgFallback, { width: baseW, height: baseH }]}>
                <Ionicons name="image-outline" size={40} color={colors.muted} />
                <Text style={styles.imgFallbackTitle}>{t("file_lost")}</Text>
                <Text style={styles.imgFallbackText}>{t("image_load_failed")}</Text>
              </View>
            ) : (
              <Image
                source={{ uri: fileUrl(view.plik_url) }}
                style={{ width: baseW, height: baseH }}
                contentFit="contain"
                onError={() => setImgError(true)}
              />
            )}
            {elements.map((el) => {
              const c = elementStatusColor(el.status);
              const isSel = selected[el.id];
              const isFocus = el.id === focusId;
              return (
                <Pressable
                  key={el.id}
                  testID={`marker-${el.id}`}
                  onPress={() => onMarkerPress(el)}
                  style={[styles.marker, {
                    left: el.pozycja_x * baseW - 12, top: el.pozycja_y * baseH - 12,
                    backgroundColor: c,
                    borderColor: isFocus || isSel ? "#fff" : "rgba(0,0,0,0.4)",
                    borderWidth: isFocus ? 3 : isSel ? 2 : 1,
                    zIndex: isFocus ? 10 : undefined,
                  }]}
                >
                  <Text style={styles.markerText} numberOfLines={1}>{el.kod}</Text>
                </Pressable>
              );
            })}
          </Animated.View>
        </GestureDetector>
      </View>

      {mode === "edit" && (
        // D: bottom edit bar must ride on top of the keyboard (Android edge-to-edge
        // ignores adjustResize, so plain padding is not enough).
        <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
          <View style={[styles.editBar, { paddingBottom: insets.bottom + spacing.sm }]}>
            <Pressable testID="series-toggle" onPress={() => setSeries((s) => !s)} style={[styles.seriesChip, series && styles.seriesChipActive]}>
              <Ionicons name="layers-outline" size={16} color={series ? "#fff" : colors.brand} />
              <Text style={[styles.seriesText, series && { color: "#fff" }]}>{t("series_mode")}</Text>
            </Pressable>
            {series ? (
              <View style={styles.seriesForm}>
                <TextInput testID="series-prefix" value={prefix} onChangeText={setPrefix} placeholder={t("series_prefix")} placeholderTextColor={colors.muted} style={styles.seriesInput} />
                <TextInput testID="series-start" value={String(nextNum)} onChangeText={(v) => setNextNum(parseInt(v) || 1)} keyboardType="number-pad" style={[styles.seriesInput, { width: 70 }]} />
              </View>
            ) : (
              <Text style={styles.editHint}>{t("tap_to_place")}</Text>
            )}
          </View>
        </KeyboardStickyView>
      )}

      {canEdit && mode !== "edit" && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
          {mode === "receive" ? (
            <>
              <Button title={t("cancel")} onPress={() => { setMode("view"); setSelected({}); }} variant="secondary" style={{ flex: 1 }} />
              <Button title={`${t("receive_selected")} (${selCount})`} onPress={receiveSelected} disabled={selCount === 0} style={{ flex: 2 }} testID="receive-selected" />
            </>
          ) : (
            <Button title={t("receipts")} icon="checkmark-circle-outline" onPress={() => setMode("receive")} disabled={counts.ready === 0} testID="enter-receive" />
          )}
        </View>
      )}

      {/* add element modal */}
      <Modal visible={!!pendingPos} transparent statusBarTranslucent navigationBarTranslucent animationType="fade" onRequestClose={() => setPendingPos(null)}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <Pressable style={styles.backdrop} onPress={() => setPendingPos(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>{t("add_element")}</Text>
            <TextInput testID="element-code" value={kod} onChangeText={setKod} placeholder={t("code")} placeholderTextColor={colors.muted} style={styles.input} />
            <SelectField testID="element-type" value={types.find((x) => x.id === typId)?.[lang === "pl" ? "nazwa_pl" : "nazwa_en"]} placeholder={t("element_type")} onPress={() => setTypePicker(true)} />
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <Button title={t("cancel")} onPress={() => setPendingPos(null)} variant="secondary" style={{ flex: 1 }} />
              <Button title={t("save")} onPress={saveElement} style={{ flex: 1 }} testID="save-element" />
            </View>
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* element detail sheet */}
      <Modal visible={!!detail} transparent animationType="slide" onRequestClose={() => setDetail(null)}>
        <Pressable style={styles.backdrop} onPress={() => setDetail(null)}>
          <Pressable style={styles.detailSheet} onPress={() => {}}>
            <View style={styles.handle} />
            <View style={styles.detailHead}>
              <View style={[styles.dot, { backgroundColor: elementStatusColor(detail?.status) }]} />
              <Text style={styles.detailKod}>{detail?.kod}</Text>
            </View>
            <Text style={styles.detailStatus}>{t(`st_${detail?.status}` as any) || detail?.status}</Text>
            <Button title={t("timeline")} icon="time-outline" variant="secondary" onPress={() => { const d = detail; setDetail(null); router.push(`/element/${d.id}`); }} testID="element-timeline" />
            {canEdit && (
              <Button title={t("delete")} icon="trash-outline" variant="danger" onPress={deleteElement} testID="delete-element" />
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <SelectSheet visible={typePicker} title={t("element_type")} options={types.map((x) => ({ value: x.id, label: x[lang === "pl" ? "nazwa_pl" : "nazwa_en"] }))} selected={typId} onSelect={setTypId} onClose={() => setTypePicker(false)} />
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  legend: { flexDirection: "row", justifyContent: "space-around", paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: colors.onSurfaceSecondary, fontSize: font.sm },
  canvasWrap: { flex: 1, backgroundColor: "#0A0A0A", overflow: "hidden", justifyContent: "center" },
  marker: { position: "absolute", minWidth: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  markerText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  editBar: { backgroundColor: colors.surfaceSecondary, borderTopWidth: 1, borderTopColor: colors.divider, padding: spacing.md, gap: spacing.sm, flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  seriesChip: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: colors.brand, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 6 },
  seriesChipActive: { backgroundColor: colors.brand },
  seriesText: { color: colors.brand, fontWeight: "700", fontSize: font.sm },
  seriesForm: { flexDirection: "row", gap: spacing.sm, flex: 1 },
  seriesInput: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm, color: colors.onSurface, minHeight: 40 },
  editHint: { color: colors.muted, fontSize: font.sm, flex: 1 },
  imgFallback: { alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary },
  imgFallbackTitle: { color: colors.onSurface, fontSize: font.lg, fontWeight: "800" },
  imgFallbackText: { color: colors.muted, fontSize: font.sm, textAlign: "center", paddingHorizontal: spacing.xl },
  footer: { flexDirection: "row", gap: spacing.md, padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.surface },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: spacing.xl },
  sheet: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.lg },
  sheetTitle: { color: colors.onSurface, fontSize: font.xl, fontWeight: "800" },
  input: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, color: colors.onSurface, fontSize: font.lg },
  detailSheet: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: colors.surfaceTertiary, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.md },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: "center" },
  detailHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dot: { width: 14, height: 14, borderRadius: 7 },
  detailKod: { color: colors.onSurface, fontSize: font.xxl, fontWeight: "800" },
  detailStatus: { color: colors.muted, fontSize: font.lg },
});
