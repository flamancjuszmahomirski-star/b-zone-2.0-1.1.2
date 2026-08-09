import React from "react";
import { View, StyleSheet } from "react-native";
import { colors, radius } from "@/src/theme/tokens";

export function ProgressBar({ value, color = colors.brand, height = 8 }: { value: number; color?: string; height?: number }) {
  const pct = Math.max(0, Math.min(100, value || 0));
  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }]} testID="progress-bar">
      <View style={{ width: `${pct}%`, backgroundColor: color, height, borderRadius: height / 2 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { backgroundColor: colors.surfaceTertiary, overflow: "hidden", width: "100%" },
});
