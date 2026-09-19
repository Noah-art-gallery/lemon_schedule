import type { ReactNode } from "react";

import { BottomNav } from "@/components/layout/bottom-nav";
import { TopBar } from "@/components/layout/top-bar";

interface AppShellProps {
  children: ReactNode;
  notificationCount?: number;
}

export function AppShell({ children, notificationCount = 0 }: AppShellProps) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        본문으로 건너뛰기
      </a>
      <aside className="app-shell__nav">
        <BottomNav />
      </aside>
      <div className="app-shell__body">
        <TopBar notificationCount={notificationCount} />
        <main id="main-content" className="page-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
