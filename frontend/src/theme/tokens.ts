// B-ZONE 2.0 design tokens — Dark-First Utility.
export const colors = {
  surface: "#121212",
  onSurface: "#F3F4F6",
  surfaceSecondary: "#1A1A1A",
  onSurfaceSecondary: "#E5E7EB",
  surfaceTertiary: "#262626",
  onSurfaceTertiary: "#D1D5DB",
  brand: "#F97316",
  brandPrimary: "#F97316",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#EA580C",
  brandTertiary: "#431407",
  onBrandTertiary: "#FED7AA",
  success: "#10B981",
  onSuccess: "#FFFFFF",
  warning: "#F59E0B",
  error: "#EF4444",
  onError: "#FFFFFF",
  info: "#3B82F6",
  border: "#262626",
  borderStrong: "#404040",
  divider: "#1F1F1F",
  muted: "#8A8A8A",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
};

export const font = {
  sm: 12,
  base: 14,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

// Element status color mapping (Etap 2A).
export const elementStatusColor = (status: string): string => {
  if (status === "odebrany") return colors.success;
  if (status === "zgloszony_gotowy") return colors.warning;
  return colors.muted; // do_wykonania
};
export const statusColor = (status: string): string => {
  const s = (status || "").toLowerCase();
  if (["zatwierdzony", "zatwierdzone", "aktywny", "rozwiazane", "potwierdzona"].includes(s))
    return colors.success;
  if (["odrzucony", "odrzucone", "odrzucona"].includes(s)) return colors.error;
  if (["naliczone", "oczekujacy", "otwarte", "awizowana", "wyslany"].includes(s))
    return colors.warning;
  if (["w_trakcie"].includes(s)) return colors.info;
  return colors.muted;
};
