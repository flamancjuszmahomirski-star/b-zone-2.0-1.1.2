import React from "react";
import { View, Text, StyleSheet, FlatList, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, spacing, font, radius } from "@/src/theme/tokens";
import { useI18n } from "@/src/i18n/I18nContext";
import { useProjects } from "@/src/context/ProjectContext";
import { Header } from "@/src/components/Screen";
import { EmptyState } from "@/src/components/States";

export default function SelectProject() {
  const { t } = useI18n();
  const { projects, selected, selectProject } = useProjects();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <Header title={t("select_project")} back />
      {projects.length === 0 ? (
        <EmptyState icon="business-outline" message={t("empty_projects")} />
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xxl }}
          renderItem={({ item }) => {
            const active = item.id === selected?.id;
            return (
              <Pressable
                testID={`select-project-${item.id}`}
                onPress={() => { selectProject(item); router.back(); }}
                style={[styles.row, active && styles.rowActive]}
              >
                <View style={styles.iconWrap}>
                  <Ionicons name="business" size={22} color={colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.nazwa}</Text>
                  <Text style={styles.meta}>{item.klient_nazwa || item.adres || ""}</Text>
                </View>
                {active && <Ionicons name="checkmark-circle" size={22} color={colors.brand} />}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  rowActive: { borderColor: colors.brand },
  iconWrap: { width: 44, height: 44, borderRadius: 8, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  name: { color: colors.onSurface, fontSize: font.lg, fontWeight: "700" },
  meta: { color: colors.muted, fontSize: font.base },
});
