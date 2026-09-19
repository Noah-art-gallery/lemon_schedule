"use client";

import { Home, PawPrint, Sprout, UserRound, UsersRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navigationItems = [
  { href: "/", label: "홈", icon: Home },
  { href: "/friends", label: "친구", icon: UsersRound },
  { href: "/pet", label: "펫", icon: PawPrint },
  { href: "/profile", label: "내 정보", icon: UserRound },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav" aria-label="주요 메뉴">
      <span className="bottom-nav__sprout" aria-hidden="true">
        <Sprout size={18} />
      </span>
      {navigationItems.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === href : pathname.startsWith(href);

        return (
          <Link
            key={href}
            href={href}
            className={`bottom-nav__item ${active ? "bottom-nav__item--active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={21} strokeWidth={active ? 2.5 : 2} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
