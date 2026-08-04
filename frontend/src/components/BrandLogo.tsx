import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, font, spacing } from "@/src/theme/tokens";

// Placeholder for the bison-in-hard-hat logo (real PNG provided later).
export function BrandLogo({ size = 88 }: { size?: number }) {
  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.box,
          { width: size, height: size, borderRadius: radius.lg },
        ]}
      >
        <Ionicons name="hammer" size={size * 0.42} color={colors.onBrandPrimary} />
      </View>
      <Text style={styles.name}>B-ZONE 2.0</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: spacing.md },
  box: {
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    color: colors.onSurface,
    fontSize: font.xxl,
    fontWeight: "900",
    letterSpacing: 1,
  },
});
