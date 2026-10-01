"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { BottomNav } from "@/components/layout/bottom-nav";
import { TopBar } from "@/components/layout/top-bar";
import { useAuth } from "@/features/auth/auth-provider";
import { listenForPushNavigation } from "@/features/push/push-service";
import { getSupabaseClient } from "@/lib/supabase/client";

interface AppShellProps {
  children: ReactNode;
  notificationCount?: number;
}

export function AppShell({ children, notificationCount }: AppShellProps) {
  const { status, demo, user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (status === "unauthenticated") window.location.replace("/login/");
  }, [status]);

  useEffect(() => {
    let cleanup: (() => Promise<void>) | undefined;
    void listenForPushNavigation().then((next) => {
      cleanup = next;
    });
    return () => {
      void cleanup?.();
    };
  }, []);

  useEffect(() => {
    if (!user || demo) return;
    const client = getSupabaseClient();
    let active = true;
    const refresh = async () => {
      const { count, error } = await client
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", user.id)
        .is("read_at", null);
      if (active && !error) setUnreadCount(count ?? 0);
    };
    void refresh();
    const refreshOnFocus = () => void refresh();
    window.addEventListener("focus", refreshOnFocus);
    window.addEventListener("lemon:notifications-changed", refreshOnFocus);
    const channel = client
      .channel(`unread-notifications-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${user.id}`,
        },
        () => {
          void refresh();
        },
      )
      .subscribe();
    return () => {
      active = false;
      window.removeEventListener("focus", refreshOnFocus);
      window.removeEventListener("lemon:notifications-changed", refreshOnFocus);
      void client.removeChannel(channel);
    };
  }, [user, demo]);

  if (status === "loading" || status === "unauthenticated") {
    return (
      <main className="route-loading" aria-live="polite">
        <span className="button__spinner" aria-hidden="true" /> 앱을 준비하고 있어요.
      </main>
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        본문으로 건너뛰기
      </a>
      <aside className="app-shell__nav">
        <BottomNav />
      </aside>
      <div className="app-shell__body">
        <TopBar notificationCount={notificationCount ?? unreadCount} />
        {demo ? (
          <p className="demo-banner">
            데모 모드 · Supabase를 연결하면 실제 계정과 데이터가 저장돼요.
          </p>
        ) : null}
        <main id="main-content" className="page-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
