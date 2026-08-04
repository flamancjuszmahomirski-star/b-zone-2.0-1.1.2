import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, font } from "@/src/theme/tokens";
import { Button } from "./Button";

export function EmptyState({
  icon = "documents-outline",
  message,
  testID,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  message: string;
  testID?: string;
}) {
  return (
    <View style={styles.center} testID={testID || "empty-state"}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={40} color={colors.muted} />
      </View>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

export function LoadingState() {
  return (
    <View style={styles.center} testID="loading-state">
      <ActivityIndicator color={colors.brand} size="large" />
    </View>
  );
}

export function ErrorState({ message, onRetry, retryLabel }: { message: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <View style={styles.center} testID="error-state">
      <Ionicons name="cloud-offline-outline" size={40} color={colors.error} />
      <Text style={styles.text}>{message}</Text>
      {onRetry && (
        <Button title={retryLabel || "Retry"} onPress={onRetry} variant="secondary" icon="refresh" testID="retry-button" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
    gap: spacing.lg,
  },
  iconWrap: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { color: colors.muted, fontSize: font.lg, textAlign: "center", lineHeight: 22 },
});
