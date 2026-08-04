import React from "react";
import { Modal, View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font } from "@/src/theme/tokens";

export type Option = { value: string; label: string };

// Bottom-sheet single-select picker.
export function SelectSheet({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: Option[];
  selected?: string | null;
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={styles.title}>{title}</Text>
          <ScrollView style={{ maxHeight: 400 }}>
            {options.length === 0 && <Text style={styles.empty}>—</Text>}
            {options.map((o) => {
              const active = o.value === selected;
              return (
                <Pressable
                  key={o.value}
                  testID={`option-${o.value}`}
                  style={[styles.option, active && styles.optionActive]}
                  onPress={() => {
                    onSelect(o.value);
                    onClose();
                  }}
                >
                  <Text style={[styles.optionText, active && { color: colors.brand }]}>{o.label}</Text>
                  {active && <Ionicons name="checkmark" size={20} color={colors.brand} />}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Field-like trigger for the select sheet.
export function SelectField({
  label,
  value,
  placeholder,
  onPress,
  testID,
}: {
  label?: string;
  value?: string;
  placeholder: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <View style={{ gap: spacing.xs }}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <Pressable testID={testID} style={styles.field} onPress={onPress}>
        <Text style={[styles.fieldValue, !value && { color: colors.muted }]}>{value || placeholder}</Text>
        <Ionicons name="chevron-down" size={18} color={colors.muted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surfaceTertiary,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
    gap: spacing.sm,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: "center", marginBottom: spacing.sm },
  title: { color: colors.onSurface, fontSize: font.xl, fontWeight: "800", marginBottom: spacing.sm },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  optionActive: { backgroundColor: colors.surfaceSecondary },
  optionText: { color: colors.onSurface, fontSize: font.lg },
  empty: { color: colors.muted, padding: spacing.md },
  fieldLabel: { color: colors.onSurfaceSecondary, fontSize: font.sm, fontWeight: "600" },
  field: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    minHeight: 50,
  },
  fieldValue: { color: colors.onSurface, fontSize: font.lg, flex: 1 },
});
