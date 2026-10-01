"use client";

import type { User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { hasSupabaseConfig, isDemoMode } from "@/lib/env";
import { getSupabaseClient } from "@/lib/supabase/client";
import { disableNativePush } from "@/features/push/push-service";

type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "demo";

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  demo: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  status: "demo",
  user: null,
  demo: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = hasSupabaseConfig();
  const demoEnabled = isDemoMode();
  const [status, setStatus] = useState<AuthStatus>(
    demoEnabled ? "demo" : configured ? "loading" : "unauthenticated",
  );
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (!configured || demoEnabled) return;
    const client = getSupabaseClient();
    let active = true;

    void client.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUser(data.session?.user ?? null);
      setStatus(data.session ? "authenticated" : "unauthenticated");
    });

    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") void disableNativePush().catch(() => {});
      setUser(session?.user ?? null);
      setStatus(session ? "authenticated" : "unauthenticated");
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [configured, demoEnabled]);

  const value = useMemo(() => ({ status, user, demo: status === "demo" }), [status, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
