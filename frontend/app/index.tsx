import React, { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet, Platform } from "react-native";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/api/client";
import { colors } from "@/src/theme/tokens";

// Register device for push after auth (native only, non-blocking).
async function registerForPush(userId: string) {
  if (Platform.OS === "web") return;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return;
    const tokenResp = await Notifications.getDevicePushTokenAsync();
    await api("/register-push", {
      method: "POST",
      body: { user_id: userId, platform: Platform.OS, device_token: String(tokenResp.data) },
      retries: 0,
    });
  } catch {
    // non-blocking
  }
}

export default function Index() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
    } else if ((user as any).must_change_password) {
      router.replace("/change-password");
    } else {
      registerForPush(user.id);
      router.replace("/(tabs)");
    }
  }, [user, loading]);

  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.brand} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
});
