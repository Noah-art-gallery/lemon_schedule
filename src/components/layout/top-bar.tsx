import { Bell } from "lucide-react";
import Link from "next/link";

import { Brand } from "@/components/layout/brand";

interface TopBarProps {
  notificationCount?: number;
}

export function TopBar({ notificationCount = 0 }: TopBarProps) {
  return (
    <header className="top-bar">
      <Brand />
      <Link href="/notifications" className="icon-button" aria-label="알림 열기">
        <Bell size={21} aria-hidden="true" />
        {notificationCount > 0 ? (
          <span className="notification-dot" aria-label={`읽지 않은 알림 ${notificationCount}개`}>
            {notificationCount > 9 ? "9+" : notificationCount}
          </span>
        ) : null}
      </Link>
    </header>
  );
}
