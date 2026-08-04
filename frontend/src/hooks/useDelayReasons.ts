import { useState, useEffect } from "react";
import { api } from "@/src/api/client";

export type DelayReason = { id: string; nazwa_pl: string; nazwa_en: string; [k: string]: any };

export function useDelayReasons(): DelayReason[] {
  const [reasons, setReasons] = useState<DelayReason[]>([]);
  useEffect(() => {
    api<DelayReason[]>("/delay-reasons").then(setReasons).catch(() => setReasons([]));
  }, []);
  return reasons;
}
