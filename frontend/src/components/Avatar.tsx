import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { colors, radius, font } from "@/src/theme/tokens";
import { fileUrl } from "@/src/api/client";
import { initials } from "@/src/utils/format";

export function Avatar({
  uri,
  imie,
  nazwisko,
  size = 40,
}: {
  uri?: string | null;
  imie?: string;
  nazwisko?: string;
  size?: number;
}) {
  const src = fileUrl(uri);
  if (src) {
    return (
      <Image
        source={{ uri: src }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceTertiary }}
        contentFit="cover"
        transition={150}
      />
    );
  }
  return (
    <View
      style={[
        styles.fallback,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={{ color: colors.onBrandTertiary, fontWeight: "700", fontSize: size * 0.38 }}>
        {initials(imie, nazwisko) || "BZ"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
});
