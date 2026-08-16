import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { colors, spacing, font, radius, elementStatusColor } from "@/src/theme/tokens";
import { useI18n } from "@/src/i18n/I18nContext";
import { useAuth } from "@/src/context/AuthContext";
import { api, fileUrl } from "@/src/api/client";
import { Header } from "@/src/components/Screen";
import { Card } from "@/src/components/Card";
import { Button } from "@/src/components/Button";
import { Avatar } from "@/src/components/Avatar";
import { StatusBadge } from "@/src/components/StatusBadge";
import { LoadingState, EmptyState, ErrorState } from "@/src/components/States";
import { ConfirmModal } from "@/src/components/ConfirmModal";
import { useToast } from "@/src/components/Toast";
import { formatDate, formatDateTime } from "@/src/utils/format";

export default function ReportDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const isManager = user?.rola === "admin" || user?.rola === "foreman";

  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errState, setErrState] = useState<null | "notfound" | "network">(null);
  const [photo, setPhoto] = useState<any>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = useCallback(async () => {
    setErrState(null);
    try { setReport(await api(`/reports/${id}`)); }
    catch (e: any) { setReport(null); setErrState(e?.status === 404 ? "notfound" : "network"); }
    finally { setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const approve = async () => {
    try { await api(`/reports/${id}/approve`, { method: "POST" }); toast.show(t("saved")); load(); }
    catch (e: any) { toast.show(e.message || t("error_generic"), "error"); }
  };
  const reject = async (reason?: string) => {
    setRejectOpen(false);
    try { await api(`/reports/${id}/reject`, { method: "POST", body: { powod: reason } }); toast.show(t("saved")); load(); }
    catch (e: any) { toast.show(e.message || t("error_generic"), "error"); }
  };
  const del = async () => {
    setDeleteOpen(false);
    try { await api(`/reports/${id}`, { method: "DELETE" }); toast.show(t("saved")); router.back(); }
    catch (e: any) { toast.show(e.message || t("error_generic"), "error"); }
  };

  if (loading) return <View style={styles.screen}><Header title={t("report")} back /><LoadingState /></View>;
  if (errState === "network") return <View style={styles.screen}><Header title={t("report")} back /><ErrorState message={t("error_network")} onRetry={load} retryLabel={t("retry")} /></View>;
  if (!report) return <View style={styles.screen}><Header title={t("report")} back /><EmptyState icon="alert-circle-outline" message={t("unavailable")} /></View>;

  const canDelete = report.user_id === user?.id || user?.rola === "admin";
  // H6.2: author or admin may edit a report BEFORE it is approved (evidentiary doc).
  const canEditReport = (report.user_id === user?.id || user?.rola === "admin") && report.status !== "zatwierdzony";

  return (
    <View style={styles.screen}>
      <Header title={t("report")} back right={<StatusBadge status={report.status} />} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: insets.bottom + 100 }}>
        <View style={styles.authorRow}>
          <Avatar uri={report.autor_avatar} imie={report.autor?.split(" ")[0]} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={styles.author}>{report.autor}</Text>
            <Text style={styles.meta}>{report.project_nazwa} · {formatDate(report.data, lang)}</Text>
          </View>
        </View>

        {report.status === "odrzucony" && report.powod_odrzucenia && (
          <Card style={{ borderColor: colors.error, backgroundColor: colors.error + "12" }}>
            <Text style={styles.rejectLabel}>{t("rejected_reason")}</Text>
            <Text style={styles.rejectText}>{report.powod_odrzucenia}</Text>
          </Card>
        )}

        <Card>
          <Text style={styles.desc}>{report.opis}</Text>
        </Card>

        {report.zdjecia?.length > 0 && (
          <View style={{ gap: spacing.sm }}>
            <Text style={styles.sectionTitle}>{t("photos")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
              {report.zdjecia.map((p: any, i: number) => (
                <Pressable key={i} testID={`report-photo-${i}`} onPress={() => setPhoto(p)}>
                  <Image source={{ uri: fileUrl(p.url) }} style={styles.photo} contentFit="cover" />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {report.elementy?.length > 0 && (
          <View style={{ gap: spacing.sm }}>
            <Text style={styles.sectionTitle}>{t("reported_elements")}</Text>
            <View style={styles.chips}>
              {report.elementy.map((el: any) => (
                <Pressable key={el.id} testID={`report-el-${el.id}`} onPress={() => router.push(`/element/${el.id}`)} style={styles.chip}>
                  <View style={[styles.chipDot, { backgroundColor: elementStatusColor(el.status) }]} />
                  <Text style={styles.chipText}>{el.kod}</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.muted} />
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {report.extra_godziny?.length > 0 && (
          <View style={{ gap: spacing.sm }}>
            <Text style={styles.sectionTitle}>{t("extra_hours")}</Text>
            {report.extra_godziny.map((e: any, i: number) => (
              <Card key={i} style={{ gap: 4 }}>
                <Text style={styles.exHours}>{e.liczba_godzin} h</Text>
                {(e.przyczyna_pl || e.przyczyna_en) ? (
                  <Text style={styles.exMeta}>{lang === "pl" ? e.przyczyna_pl : e.przyczyna_en}</Text>
                ) : null}
                {e.opis ? <Text style={styles.exDesc}>{e.opis}</Text> : null}
                {e.element_kod ? <Text style={styles.exMeta}>{t("linked_element")}: {e.element_kod}</Text> : null}
              </Card>
            ))}
          </View>
        )}

        {report.pogoda_json && report.pogoda_json.temp != null ? (
          <Card style={styles.weather}>
            <Ionicons name="partly-sunny-outline" size={20} color={colors.info} />
            <View style={{ flex: 1 }}>
              <Text style={styles.weatherText}>
                {t("weather_stamp")}: {report.pogoda_json.temp}°C · {report.pogoda_json.wiatr} m/s · {report.pogoda_json.opady} mm
              </Text>
              {report.pogoda_json.miejsce ? (
                <Text style={styles.weatherLoc}>{t("location")}: {report.pogoda_json.miejsce}</Text>
              ) : null}
            </View>
          </Card>
        ) : null}
      </ScrollView>

      {(isManager && report.status === "wyslany") || canDelete || canEditReport ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
          {canEditReport && (
            <Button title={t("edit")} onPress={() => router.push(`/report-new?edit=${id}`)} variant="secondary" icon="create-outline" style={{ flex: 1 }} testID="edit-report" />
          )}
          {isManager && report.status === "wyslany" && (
            <>
              <Button title={t("reject")} onPress={() => setRejectOpen(true)} variant="danger" style={{ flex: 1 }} testID="reject-report" />
              <Button title={t("approve")} onPress={approve} style={{ flex: 1 }} testID="approve-report" />
            </>
          )}
          {isManager && report.status !== "wyslany" && canDelete && (
            <Button title={t("delete")} onPress={() => setDeleteOpen(true)} variant="danger" style={{ flex: 1 }} testID="delete-report" />
          )}
          {!isManager && canDelete && (
            <Button title={t("delete")} onPress={() => setDeleteOpen(true)} variant="danger" style={{ flex: 1 }} testID="delete-report" />
          )}
        </View>
      ) : null}

      <Modal visible={!!photo} transparent animationType="fade" onRequestClose={() => setPhoto(null)}>
        <Pressable style={styles.viewer} onPress={() => setPhoto(null)}>
          {photo && <Image source={{ uri: fileUrl(photo.url) }} style={styles.viewerImg} contentFit="contain" />}
          <View style={[styles.photoMeta, { bottom: insets.bottom + spacing.xl }]}>
            <Text style={styles.photoMetaText}>🕑 {formatDateTime(photo?.timestamp, lang)}</Text>
            {photo?.gps && <Text style={styles.photoMetaText}>📍 {photo.gps.lat.toFixed(4)}, {photo.gps.lng.toFixed(4)}</Text>}
          </View>
        </Pressable>
      </Modal>

      <ConfirmModal
        visible={rejectOpen}
        title={t("reject_report")}
        withReason
        reasonPlaceholder={t("reason_required")}
        confirmLabel={t("reject")}
        cancelLabel={t("cancel")}
        danger
        onConfirm={reject}
        onCancel={() => setRejectOpen(false)}
      />
      <ConfirmModal
        visible={deleteOpen}
        title={t("confirm_delete")}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        danger
        onConfirm={del}
        onCancel={() => setDeleteOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  authorRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  author: { color: colors.onSurface, fontSize: font.lg, fontWeight: "700" },
  meta: { color: colors.muted, fontSize: font.sm, marginTop: 2 },
  desc: { color: colors.onSurface, fontSize: font.lg, lineHeight: 24 },
  sectionTitle: { color: colors.onSurface, fontSize: font.lg, fontWeight: "700" },
  photo: { width: 120, height: 120, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  weather: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.info + "12", borderColor: colors.info + "44" },
  weatherText: { color: colors.onSurfaceSecondary, fontSize: font.base, flex: 1 },
  weatherLoc: { color: colors.muted, fontSize: font.sm, marginTop: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  chipDot: { width: 10, height: 10, borderRadius: 5 },
  chipText: { color: colors.onSurface, fontSize: font.base, fontWeight: "700" },
  exHours: { color: colors.brand, fontSize: font.lg, fontWeight: "800" },
  exMeta: { color: colors.muted, fontSize: font.sm },
  exDesc: { color: colors.onSurfaceSecondary, fontSize: font.base },
  rejectLabel: { color: colors.error, fontSize: font.sm, fontWeight: "700", marginBottom: 4 },
  rejectText: { color: colors.onSurface, fontSize: font.base },
  footer: { flexDirection: "row", gap: spacing.md, padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.surface },
  viewer: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)", alignItems: "center", justifyContent: "center" },
  viewerImg: { width: "100%", height: "80%" },
  photoMeta: { position: "absolute", left: spacing.lg, gap: 4 },
  photoMetaText: { color: "#fff", fontSize: font.base },
});
