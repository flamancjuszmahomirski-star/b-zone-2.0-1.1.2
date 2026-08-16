import React, { useState, useEffect } from "react";
import { Modal, View, Text, StyleSheet, Pressable, TextInput, KeyboardAvoidingView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font } from "@/src/theme/tokens";
import { Button } from "./Button";

// Confirmation dialog. Optional required-reason input (e.g. rejection).
export function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger,
  withReason,
  reasonPlaceholder,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  withReason?: boolean;
  reasonPlaceholder?: string;
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (visible) setReason("");
  }, [visible]);

  return (
    <Modal visible={visible} transparent statusBarTranslucent navigationBarTranslucent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          {withReason && (
            <TextInput
              testID="confirm-reason-input"
              value={reason}
              onChangeText={setReason}
              placeholder={reasonPlaceholder}
              placeholderTextColor={colors.muted}
              multiline
              style={styles.input}
            />
          )}
          <View style={styles.actions}>
            <Button title={cancelLabel} onPress={onCancel} variant="secondary" style={{ flex: 1 }} testID="confirm-cancel" />
            <Button
              title={confirmLabel}
              onPress={() => onConfirm(withReason ? reason : undefined)}
              variant={danger ? "danger" : "primary"}
              disabled={withReason && !reason.trim()}
              style={{ flex: 1 }}
              testID="confirm-ok"
            />
          </View>
        </Pressable>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surfaceTertiary,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    alignSelf: "center",
    marginBottom: spacing.sm,
  },
  title: { color: colors.onSurface, fontSize: font.xl, fontWeight: "800" },
  message: { color: colors.onSurfaceSecondary, fontSize: font.lg, lineHeight: 22 },
  input: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    color: colors.onSurface,
    minHeight: 80,
    textAlignVertical: "top",
    fontSize: font.base,
  },
  actions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
});
