import { storage } from "@/src/utils/storage";

export const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || "";
export const API = `${BACKEND_URL}/api`;
export const TOKEN_KEY = "bzone.token";

export function fileUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http")) return path;
  return `${BACKEND_URL}${path}`;
}

export async function authHeader(): Promise<Record<string, string>> {
  const token = await storage.secureGet<string>(TOKEN_KEY, "");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// C4: FastAPI returns `detail` as a string for HTTPException, but as a LIST of
// {loc, msg, type} objects for 422 validation errors. Render both readably
// (never "[object Object]").
export function detailToMessage(detail: any): string | undefined {
  if (!detail) return undefined;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const first = detail[0];
    if (first && typeof first === "object") {
      const field = Array.isArray(first.loc) ? String(first.loc[first.loc.length - 1]) : "";
      const msg = first.msg || first.message || "";
      return field && field !== "body" ? `${field}: ${msg}` : msg || undefined;
    }
    return String(first);
  }
  if (typeof detail === "object") return detail.msg || detail.message || JSON.stringify(detail);
  return String(detail);
}

type Opts = { method?: string; body?: any; retries?: number };

// JSON API call with token + simple retry for weak networks.
export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const { method = "GET", body, retries = 2 } = opts;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(await authHeader()),
  };
  let lastErr: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${API}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err: any = new Error(detailToMessage(data.detail) || "Request failed");
        err.status = res.status;
        throw err;
      }
      return data as T;
    } catch (e: any) {
      lastErr = e;
      // do not retry auth/validation errors
      if (e.status && e.status < 500 && e.status !== 0) break;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
    }
  }
  throw lastErr;
}

// Multipart upload (photos / attachments). Returns {id, url, name}.
// Bounded timeout + one retry on network drop; clear errors for size vs. network.
export async function uploadFile(
  fileObj: { uri: string; name: string; type: string },
  kind: string
): Promise<{ id: string; url: string; name: string }> {
  const headers = await authHeader();
  let lastErr: any;
  for (let attempt = 0; attempt < 2; attempt++) {
    const form = new FormData();
    // @ts-ignore react-native FormData file
    form.append("file", fileObj as any);
    form.append("kind", kind);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const res = await fetch(`${API}/files`, { method: "POST", headers, body: form, signal: controller.signal });
      clearTimeout(timer);
      if (res.status === 413) {
        const err: any = new Error("PHOTO_TOO_LARGE");
        err.code = "PHOTO_TOO_LARGE";
        throw err;
      }
      if (!res.ok) {
        const err: any = new Error("UPLOAD_FAILED");
        err.code = "UPLOAD_FAILED";
        err.status = res.status;
        throw err;
      }
      return res.json();
    } catch (e: any) {
      clearTimeout(timer);
      lastErr = e;
      if (e.code === "PHOTO_TOO_LARGE") throw e; // don't retry a too-big file
      if (attempt === 0) await new Promise((r) => setTimeout(r, 800));
    }
  }
  const err: any = lastErr || new Error("UPLOAD_FAILED");
  if (!err.code) err.code = "UPLOAD_FAILED";
  throw err;
}

// Audio transcription. audio: {uri,name,type}. Returns transcript text.
export async function transcribeAudio(
  audio: { uri: string; name: string; type: string },
  language: string
): Promise<string> {
  const form = new FormData();
  // @ts-ignore
  form.append("file", audio as any);
  form.append("language", language);
  const headers = await authHeader();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const res = await fetch(`${API}/transcribe`, { method: "POST", headers, body: form, signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(detailToMessage(data.detail) || `Transcription failed (${res.status})`);
    return data.text || "";
  } finally {
    clearTimeout(timer);
  }
}
