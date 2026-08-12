// Single source of truth for password policy (A1 — reguła długości w JEDNYM miejscu).
export const PASSWORD_MIN = 14;

export const isValidEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || "").trim());

// Display-name fallback order used everywhere a person is shown (E2).
export function personName(u?: { imie?: string; nazwisko?: string; email?: string } | null): string {
  if (!u) return "—";
  const full = `${u.imie || ""} ${u.nazwisko || ""}`.trim();
  if (full) return full;
  if (u.email) return u.email.split("@")[0];
  return "Użytkownik";
}
