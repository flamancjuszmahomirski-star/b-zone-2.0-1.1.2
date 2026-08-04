import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { colors, spacing, font, radius } from "@/src/theme/tokens";
import { useI18n } from "@/src/i18n/I18nContext";
import { useAuth } from "@/src/context/AuthContext";
import { api, fileUrl } from "@/src/api/client";
import { Header } from "@/src/components/Screen";
import { Card } from "@/src/components/Card";
import { Button } from "@/src/components/Button";
import { StatusBadge } from "@/src/components/StatusBadge";
import { LoadingState } from "@/src/components/States";
import { useToast } from "@/src/components/Toast";
import { formatDate } from "@/src/utils/format";

export default function DeliveryDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const isManager = user?.rola === "admin" || user?.rola === "foreman";

  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setD(await api(`/deliveries/${id}`)); } catch { setD(null); } finally { setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const setStatus = async (status: string) => {
    try { await api(`/deliveries/${id}/status`, { method: "PATCH", body: { status } }); toast.show(t("saved")); load(); }
    catch (e: any) { toast.show(e.message || t("error_generic"), "error"); }
  };

  if (loading) return <View style={styles.screen}><Header title={t("delivery")} back /><LoadingState /></View>;
  if (!d) return <View style={styles.screen}><Header title={t("delivery")} back /></View>;

  return (
    <View style={styles.screen}>
      <Header title={t("delivery")} back right={<StatusBadge status={d.status} />} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: insets.bottom + 100 }}>
        <Text style={styles.meta}>{d.project_nazwa} · {d.data_planowana ? formatDate(d.data_planowana, lang) : "—"}</Text>
        <Card><Text style={styles.desc}>{d.opis}</Text></Card>
        {d.zalacznik_url && (
          <Pressable testID="download-attachment" onPress={() => Linking.openURL(fileUrl(d.zalacznik_url)!)} style={styles.attach}>
            <Ionicons name="document-attach" size={22} color={colors.brand} />
            <Text style={styles.attachText} numberOfLines={1}>{d.zalacznik_nazwa || t("attachment")}</Text>
            <Ionicons name="download-outline" size={20} color={colors.muted} />
          </Pressable>
        )}
      </ScrollView>
      {isManager && d.status === "awizowana" && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
          <Button title={t("reject_delivery")} onPress={() => setStatus("odrzucona")} variant="danger" style={{ flex: 1 }} testID="reject-delivery" />
          <Button title={t("confirm_delivery")} onPress={() => setStatus("potwierdzona")} style={{ flex: 1 }} testID="confirm-delivery" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  meta: { color: colors.muted, fontSize: font.base },
  desc: { color: colors.onSurface, fontSize: font.lg, lineHeight: 24 },
  attach: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  attachText: { color: colors.onSurface, fontSize: font.base, flex: 1, fontWeight: "600" },
  footer: { flexDirection: "row", gap: spacing.md, padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.surface },
});
