# Shared layouts

## `src/components/layout/app-shell.tsx`

The mobile-first application shell renders a skip link, `BottomNav`, `TopBar`, an optional demo banner, and a main content region. It redirects unauthenticated users to `/login/` and provides notification count state.

## `src/components/layout/top-bar.tsx`

The top header pairs the `Brand` link with a circular notification icon link.

```tsx
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
```

## `src/components/layout/bottom-nav.tsx`

Persistent navigation contains 홈, 친구, 펫, and 내 정보, using Lucide Home, UsersRound, PawPrint, and UserRound icons. The active item uses `bottom-nav__item--active`.
