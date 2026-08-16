// Formatting helpers.

// Currency with abbreviation: 225000 -> "225 tys. €" (PL) / "225k €" (EN).
export function formatCurrency(amount: number, currency = "EUR", lang: string = "pl"): string {
  const sym = currency === "EUR" ? "€" : currency;
  const abbr = lang === "pl" ? " tys." : "k";
  if (amount == null || isNaN(amount)) return `0 ${sym}`;
  const abs = Math.abs(amount);
  if (abs >= 1000) {
    const tys = amount / 1000;
    const str =
      tys % 1 === 0 ? String(tys) : tys.toFixed(1).replace(".", lang === "pl" ? "," : ".");
    return `${str}${abbr} ${sym}`;
  }
  return `${amount.toString().replace(".", lang === "pl" ? "," : ".")} ${sym}`;
}

export function formatDate(iso?: string | null, lang: string = "pl"): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(lang === "pl" ? "pl-PL" : "en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function formatDateTime(iso?: string | null, lang: string = "pl"): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString(lang === "pl" ? "pl-PL" : "en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function initials(imie?: string, nazwisko?: string): string {
  return `${(imie || "?")[0] || ""}${(nazwisko || "")[0] || ""}`.toUpperCase();
}

// Monday of the ISO week containing `iso`.
export function weekStart(iso: string): string {
  const d = new Date(iso);
  const day = (d.getDay() + 6) % 7; // Mon=0
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}
