import React, { createContext, useContext, useCallback, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font } from "@/src/theme/tokens";

type ToastType = "success" | "error" | "info";
type ToastCtx = { show: (msg: string, type?: ToastType) => void };
const Ctx = createContext<ToastCtx>({ show: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState("");
  const [type, setType] = useState<ToastType>("success");
  const [visible, setVisible] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<any>(null);

  const show = useCallback(
    (m: string, tp: ToastType = "success") => {
      setMsg(m);
      setType(tp);
      setVisible(true);
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: Platform.OS !== "web" }).start();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: Platform.OS !== "web" }).start(
          () => setVisible(false)
        );
      }, 2600);
    },
    [opacity]
  );

  const icon = type === "success" ? "checkmark-circle" : type === "error" ? "alert-circle" : "information-circle";
  const tint = type === "success" ? colors.success : type === "error" ? colors.error : colors.info;

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      {visible && (
        <Animated.View style={[styles.wrap, { opacity }]} pointerEvents="none" testID="toast">
          <View style={[styles.toast, { borderLeftColor: tint }]}>
            <Ionicons name={icon as any} size={20} color={tint} />
            <Text style={styles.text} numberOfLines={2}>
              {msg}
            </Text>
          </View>
        </Animated.View>
      )}
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    bottom: Platform.OS === "web" ? 24 : 96,
    left: spacing.lg,
    right: spacing.lg,
    alignItems: "center",
    zIndex: 9999,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
    borderLeftWidth: 4,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    maxWidth: 500,
    width: "100%",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  text: { color: colors.onSurface, fontSize: font.base, flex: 1, fontWeight: "500" },
});
