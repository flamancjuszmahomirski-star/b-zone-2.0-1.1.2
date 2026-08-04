import { storage } from "@/src/utils/storage";

export const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || "";
export const API = `${BACKEND_URL}/api`;
export const TOKEN_KEY = "bzone.token";

export function fileUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http")) return path;
  return `${BACKEND_URL}${path}`;
}

async function authHeader(): Promise<Record<string, string>> {
  const token = await storage.secureGet<string>(TOKEN_KEY, "");
  return token ? { Authorization: `Bearer ${token}` } : {};
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
        const err: any = new Error(data.detail || "Request failed");
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
export async function uploadFile(
  fileObj: { uri: string; name: string; type: string },
  kind: string
): Promise<{ id: string; url: string; name: string }> {
  const form = new FormData();
  // @ts-ignore react-native FormData file
  form.append("file", fileObj as any);
  form.append("kind", kind);
  const headers = await authHeader();
  const res = await fetch(`${API}/files`, { method: "POST", headers, body: form });
  if (!res.ok) throw new Error("Upload failed");
  return res.json();
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
  const res = await fetch(`${API}/transcribe`, { method: "POST", headers, body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "Transcription failed");
  return data.text || "";
}
