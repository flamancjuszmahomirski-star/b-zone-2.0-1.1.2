import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, spacing, font, radius } from "@/src/theme/tokens";
import { useI18n } from "@/src/i18n/I18nContext";
import { useAuth } from "@/src/context/AuthContext";
import { AppBar } from "@/src/components/AppBar";
import { Avatar } from "@/src/components/Avatar";
import { api, API, authHeader } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";

type Item = { icon: keyof typeof Ionicons.glyphMap; label: string; route?: string; testID: string; action?: () => void };

export default function More() {
  const { t } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const role = user?.rola;

  // C2b: export must actually be SAVED/SHARED before we confirm success.
  // Web: browser download. Native: expo-file-system (cache) + expo-sharing sheet.
  const doExport = async () => {
    try {
      const headers = await authHeader();
      const name = `bzone-export-${new Date().toISOString().slice(0, 10)}.zip`;
      if (Platform.OS === "web") {
        const res = await fetch(`${API}/export`, { headers });
        if (!res.ok) throw new Error("export");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = name; a.click();
        URL.revokeObjectURL(url);
      } else {
        const dest = `${FileSystem.cacheDirectory}${name}`;
        const dl = await FileSystem.downloadAsync(`${API}/export`, dest, { headers });
        if (dl.status !== 200) throw new Error("export");
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(dl.uri, { mimeType: "application/zip", dialogTitle: name });
        } else {
          throw new Error("sharing-unavailable");
        }
      }
      const info: any = await api("/export/last");
      const when = info?.last_export_at ? String(info.last_export_at).slice(0, 16).replace("T", " ") : "";
      toast.show(`${t("export_done")}${when ? " · " + when : ""}`);
    } catch {
      toast.show(t("export_save_failed"), "error");
    }
  };

  const common: Item[] = [
    { icon: "notifications-outline", label: t("notifications"), route: "/notifications", testID: "more-notifications" },
    { icon: "cube-outline", label: t("deliveries"), route: "/deliveries", testID: "more-deliveries" },
    { icon: "person-outline", label: t("profile"), route: "/profile", testID: "more-profile" },
  ];

  const adminItems: Item[] = [
    { icon: "business-outline", label: t("projects"), route: "/projects", testID: "more-projects" },
    { icon: "people-outline", label: t("user_management"), route: "/users", testID: "more-users" },
    { icon: "pricetags-outline", label: t("element_types"), route: "/element-types", testID: "more-element-types" },
    { icon: "download-outline", label: t("export_data"), testID: "more-export", action: doExport },
    { icon: "list-outline", label: t("audit_log"), route: "/audit", testID: "more-audit" },
    { icon: "archive-outline", label: t("archive_view"), route: "/archive", testID: "more-archive" },
  ];

  const items = role === "admin" ? [...adminItems, ...common] : common;

  return (
    <View style={styles.screen}>
      <AppBar title={t("tab_more")} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xxl }}>
        <Pressable testID="more-profile-card" onPress={() => router.push("/profile")} style={styles.profileCard}>
          <Avatar uri={user?.avatar_url} imie={user?.imie} nazwisko={user?.nazwisko} size={54} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user?.imie} {user?.nazwisko}</Text>
            <Text style={styles.role}>{t(`role_${role}` as any)}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Pressable>

        {items.map((it) => (
          <Pressable key={it.testID} testID={it.testID} onPress={() => (it.action ? it.action() : router.push(it.route as any))} style={styles.row}>
            <View style={styles.iconWrap}>
              <Ionicons name={it.icon} size={22} color={colors.brand} />
            </View>
            <Text style={styles.label}>{it.label}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  profileCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm,
  },
  name: { color: colors.onSurface, fontSize: font.lg, fontWeight: "800" },
  role: { color: colors.brand, fontSize: font.base, marginTop: 2 },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border,
  },
  iconWrap: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  label: { color: colors.onSurface, fontSize: font.lg, fontWeight: "600", flex: 1 },
});
