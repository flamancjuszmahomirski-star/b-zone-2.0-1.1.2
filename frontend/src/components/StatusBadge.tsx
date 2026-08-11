import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, spacing, radius, font, statusColor } from "@/src/theme/tokens";
import { useI18n } from "@/src/i18n/I18nContext";
import { translations } from "@/src/i18n/translations";

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const { t } = useI18n();
  const c = statusColor(status);
  const key = `st_${status}`;
  const text = label || ((translations.pl as any)[key] ? t(key as any) : status);
  return (
    <View style={[styles.badge, { backgroundColor: c + "22", borderColor: c + "55" }]} testID={`status-${status}`}>
      <View style={[styles.dot, { backgroundColor: c }]} />
      <Text style={[styles.text, { color: c }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontSize: font.sm, fontWeight: "700", textTransform: "capitalize" },
});
