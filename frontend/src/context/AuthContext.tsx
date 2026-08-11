import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { storage } from "@/src/utils/storage";
import { api, TOKEN_KEY } from "@/src/api/client";

export type Role = "admin" | "foreman" | "subcontractor" | "worker" | "contractor";

export type User = {
  id: string;
  email: string;
  imie: string;
  nazwisko: string;
  rola: Role;
  avatar_url?: string | null;
  telefon?: string;
  status: string;
  stawka_godz_eur?: number;
  jezyk?: string;
  must_change_password?: boolean;
};

type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (email: string, haslo: string) => Promise<User>;
  register: (payload: {
    email: string;
    haslo: string;
    imie: string;
    nazwisko: string;
    telefon?: string;
  }) => Promise<any>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: User) => void;
};

const Ctx = createContext<AuthCtx>({} as AuthCtx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const token = await storage.secureGet<string>(TOKEN_KEY, "");
      if (!token) {
        setUserState(null);
        return;
      }
      const me = await api<User>("/auth/me");
      setUserState(me);
    } catch {
      setUserState(null);
      await storage.secureRemove(TOKEN_KEY);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const login = useCallback(async (email: string, haslo: string) => {
    const res = await api<{ access_token: string; user: User }>("/auth/login", {
      method: "POST",
      body: { email, haslo },
      retries: 0,
    });
    await storage.secureSet(TOKEN_KEY, res.access_token);
    setUserState(res.user);
    return res.user;
  }, []);

  const register = useCallback(
    async (payload: { email: string; haslo: string; imie: string; nazwisko: string; telefon?: string }) => {
      return api("/auth/register", { method: "POST", body: payload, retries: 0 });
    },
    []
  );

  const logout = useCallback(async () => {
    await storage.secureRemove(TOKEN_KEY);
    setUserState(null);
  }, []);

  const setUser = useCallback((u: User) => setUserState(u), []);

  return (
    <Ctx.Provider value={{ user, loading, login, register, logout, refresh, setUser }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
