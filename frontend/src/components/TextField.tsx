import React from "react";
import { View, Text, StyleSheet, TextInput, TextInputProps } from "react-native";
import { colors, spacing, radius, font } from "@/src/theme/tokens";

type Props = TextInputProps & {
  label?: string;
  testID?: string;
  hint?: string;
};

export function TextField({ label, hint, style, testID, ...rest }: Props) {
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        testID={testID}
        placeholderTextColor={colors.muted}
        style={[styles.input, style]}
        {...rest}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { color: colors.onSurfaceSecondary, fontSize: font.sm, fontWeight: "600" },
  input: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.onSurface,
    fontSize: font.lg,
    minHeight: 50,
  },
  hint: { color: colors.muted, fontSize: font.sm },
});
