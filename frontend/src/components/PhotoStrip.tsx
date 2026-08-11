import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Linking, Modal } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as Location from "expo-location";
import { colors, spacing, font, radius } from "@/src/theme/tokens";
import { useI18n } from "@/src/i18n/I18nContext";
import { uploadFile, fileUrl } from "@/src/api/client";
import { useToast } from "./Toast";

export type Photo = { file_id: string; url: string; timestamp: string; gps?: { lat: number; lng: number } | null };

// Horizontal photo strip with camera/gallery add. Attaches timestamp + optional GPS.
export function PhotoStrip({
  photos,
  onChange,
}: {
  photos: Photo[];
  onChange: (p: Photo[]) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [picker, setPicker] = useState(false);
  const [uploading, setUploading] = useState(false);

  const getGps = async (): Promise<{ lat: number; lng: number } | null> => {
    try {
      const cur = await Location.getForegroundPermissionsAsync();
      let granted = cur.granted;
      if (!granted && cur.canAskAgain) {
        const req = await Location.requestForegroundPermissionsAsync();
        granted = req.granted;
      }
      if (!granted) return null;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      return { lat: loc.coords.latitude, lng: loc.coords.longitude };
    } catch {
      return null;
    }
  };

  const handleResult = async (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setUploading(true);
    try {
      const gps = await getGps();
      // Client-side compression BEFORE upload: resize longest side to 1920px, JPEG q0.6.
      // Cuts a 4000px phone photo by ~75% so uploads don't hit size/timeout limits.
      let uri = asset.uri;
      try {
        const manip = await ImageManipulator.manipulateAsync(
          asset.uri,
          [{ resize: { width: (asset.width || 4000) >= (asset.height || 3000) ? 1920 : undefined,
                       height: (asset.height || 3000) > (asset.width || 4000) ? 1920 : undefined } }],
          { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
        );
        uri = manip.uri;
      } catch {
        // If manipulation fails (rare), fall back to the original picked (already q0.6).
      }
      const name = `zdjecie_${Date.now()}.jpg`;
      const fileObj: any =
        typeof window !== "undefined" && (asset as any).file
          ? (asset as any).file
          : { uri, name, type: "image/jpeg" };
      const up = await uploadFile(fileObj, "report_photo");
      onChange([...photos, { file_id: up.id, url: up.url, timestamp: new Date().toISOString(), gps }]);
      toast.show(t("saved"));
    } catch (e: any) {
      if (e?.code === "PHOTO_TOO_LARGE") toast.show(t("photo_too_large"), "error");
      else toast.show(t("upload_failed_retry"), "error");
    } finally {
      setUploading(false);
    }
  };

  const fromCamera = async () => {
    setPicker(false);
    const cur = await ImagePicker.getCameraPermissionsAsync();
    let granted = cur.granted;
    if (!granted && cur.canAskAgain) {
      const req = await ImagePicker.requestCameraPermissionsAsync();
      granted = req.granted;
    }
    if (!granted) {
      toast.show(t("perm_denied"), "error");
      Linking.openSettings();
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    handleResult(res);
  };

  const fromGallery = async () => {
    setPicker(false);
    const cur = await ImagePicker.getMediaLibraryPermissionsAsync();
    let granted = cur.granted;
    if (!granted && cur.canAskAgain) {
      const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
      granted = req.granted;
    }
    if (!granted) {
      toast.show(t("perm_denied"), "error");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    handleResult(res);
  };

  const remove = (id: string) => onChange(photos.filter((p) => p.file_id !== id));

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {photos.map((p) => (
          <View key={p.file_id} style={styles.thumbWrap}>
            <Image source={{ uri: fileUrl(p.url) }} style={styles.thumb} contentFit="cover" />
            <Pressable testID={`remove-photo-${p.file_id}`} onPress={() => remove(p.file_id)} style={styles.removeBtn}>
              <Ionicons name="close" size={14} color="#fff" />
            </Pressable>
          </View>
        ))}
        <Pressable testID="add-photo-btn" onPress={() => setPicker(true)} style={styles.addBtn} disabled={uploading}>
          <Ionicons name={uploading ? "hourglass" : "camera"} size={26} color={colors.brand} />
          <Text style={styles.addText} numberOfLines={2}>{uploading ? t("uploading_photo") : t("add_photo")}</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={picker} transparent animationType="fade" onRequestClose={() => setPicker(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPicker(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Pressable testID="pick-camera" style={styles.sheetRow} onPress={fromCamera}>
              <Ionicons name="camera-outline" size={22} color={colors.onSurface} />
              <Text style={styles.sheetText}>{t("take_photo")}</Text>
            </Pressable>
            <Pressable testID="pick-gallery" style={styles.sheetRow} onPress={fromGallery}>
              <Ionicons name="images-outline" size={22} color={colors.onSurface} />
              <Text style={styles.sheetText}>{t("from_gallery")}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { gap: spacing.sm, paddingVertical: spacing.xs },
  thumbWrap: { position: "relative" },
  thumb: { width: 80, height: 80, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  removeBtn: {
    position: "absolute", top: -6, right: -6, backgroundColor: colors.error,
    width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center",
  },
  addBtn: {
    width: 80, height: 80, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 2, backgroundColor: colors.surfaceSecondary,
  },
  addText: { color: colors.brand, fontSize: 10, fontWeight: "600" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surfaceTertiary, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.sm },
  sheetRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
  sheetText: { color: colors.onSurface, fontSize: font.lg, fontWeight: "600" },
});
