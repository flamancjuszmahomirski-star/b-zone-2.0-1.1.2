import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { colors, spacing, font, radius } from "@/src/theme/tokens";
import { useI18n } from "@/src/i18n/I18nContext";
import { useAuth } from "@/src/context/AuthContext";
import { api, fileUrl } from "@/src/api/client";
import { Header } from "@/src/components/Screen";
import { Card } from "@/src/components/Card";
import { Button } from "@/src/components/Button";
import { Avatar } from "@/src/components/Avatar";
import { StatusBadge } from "@/src/components/StatusBadge";
import { LoadingState } from "@/src/components/States";
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
  const [photo, setPhoto] = useState<any>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = useCallback(async () => {
    try { setReport(await api(`/reports/${id}`)); } catch { setReport(null); } finally { setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

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
  if (!report) return <View style={styles.screen}><Header title={t("report")} back /></View>;

  const canDelete = report.user_id === user?.id || user?.rola === "admin";

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

        {report.pogoda_json && (
          <Card style={styles.weather}>
            <Ionicons name="partly-sunny-outline" size={20} color={colors.info} />
            <Text style={styles.weatherText}>
              {t("weather_stamp")}: {report.pogoda_json.temp}°C · {report.pogoda_json.wiatr} m/s · {report.pogoda_json.opady} mm
            </Text>
          </Card>
        )}
      </ScrollView>

      {(isManager && report.status === "wyslany") || canDelete ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
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
  rejectLabel: { color: colors.error, fontSize: font.sm, fontWeight: "700", marginBottom: 4 },
  rejectText: { color: colors.onSurface, fontSize: font.base },
  footer: { flexDirection: "row", gap: spacing.md, padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.surface },
  viewer: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)", alignItems: "center", justifyContent: "center" },
  viewerImg: { width: "100%", height: "80%" },
  photoMeta: { position: "absolute", left: spacing.lg, gap: 4 },
  photoMetaText: { color: "#fff", fontSize: font.base },
});
