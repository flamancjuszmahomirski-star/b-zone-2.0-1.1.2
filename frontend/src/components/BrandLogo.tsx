import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { colors, font, spacing } from "@/src/theme/tokens";

// Bison-in-hard-hat brand logo.
export function BrandLogo({ size = 120 }: { size?: number }) {
  return (
    <View style={styles.wrap}>
      <Image
        source={require("../../assets/images/bzone-logo-square.png")}
        style={{ width: size, height: size }}
        contentFit="contain"
      />
      <Text style={styles.name}>B-ZONE 2.0</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: spacing.xs },
  name: { color: colors.onSurface, fontSize: font.xxl, fontWeight: "900", letterSpacing: 1 },
});
