"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";

import { BottomNav } from "@/components/layout/bottom-nav";
import { TopBar } from "@/components/layout/top-bar";
import { LoadingIndicator } from "@/components/ui/feedback";
import { useAuth } from "@/features/auth/auth-provider";
import { listenForPushNavigation } from "@/features/push/push-service";
import { useInboxUnreadCount } from "@/features/notifications/inbox-events";

interface AppShellProps {
  children: ReactNode;
  notificationCount?: number;
}

export function AppShell({ children, notificationCount }: AppShellProps) {
  const { status, demo } = useAuth();
  const unreadCount = useInboxUnreadCount();

  useEffect(() => {
    if (status === "unauthenticated") window.location.replace("/login/");
  }, [status]);

  useEffect(() => {
    let cleanup: (() => Promise<void>) | undefined;
    let active = true;
    void listenForPushNavigation().then((next) => {
      if (active) cleanup = next;
      else void next();
    });
    return () => {
      active = false;
      void cleanup?.();
    };
  }, []);

  if (status === "loading" || status === "unauthenticated") {
    return (
      <main className="route-loading">
        <LoadingIndicator label="불러오는 중" />
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
        {demo ? <p className="demo-banner">미리보기 · 실제 저장 안 됨</p> : null}
        <main id="main-content" className="page-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
