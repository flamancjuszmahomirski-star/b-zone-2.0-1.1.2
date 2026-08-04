import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "@/src/api/client";
import { storage } from "@/src/utils/storage";
import { useAuth } from "./AuthContext";

export type Project = {
  id: string;
  nazwa: string;
  kod?: string;
  klient_nazwa?: string;
  adres?: string;
  waluta?: string;
  status?: string;
  liczba_czlonkow?: number;
  logo_url?: string | null;
  [k: string]: any;
};

type ProjectCtx = {
  projects: Project[];
  selected: Project | null;
  loading: boolean;
  selectProject: (p: Project) => void;
  reload: () => Promise<void>;
};

const Ctx = createContext<ProjectCtx>({} as ProjectCtx);
const SEL_KEY = "bzone.selectedProject";

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!user) {
      setProjects([]);
      setSelected(null);
      return;
    }
    setLoading(true);
    try {
      const list = await api<Project[]>("/projects?status=aktywny");
      setProjects(list);
      const savedId = await storage.getItem<string>(SEL_KEY, "");
      const found = list.find((p) => p.id === savedId);
      setSelected(found || list[0] || null);
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    reload();
  }, [reload]);

  const selectProject = useCallback((p: Project) => {
    setSelected(p);
    storage.setItem(SEL_KEY, p.id);
  }, []);

  return (
    <Ctx.Provider value={{ projects, selected, loading, selectProject, reload }}>
      {children}
    </Ctx.Provider>
  );
}

export const useProjects = () => useContext(Ctx);
