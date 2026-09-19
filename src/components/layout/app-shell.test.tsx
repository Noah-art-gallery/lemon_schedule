import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/layout/app-shell";

const { usePathname } = vi.hoisted(() => ({
  usePathname: vi.fn(() => "/friends"),
}));

vi.mock("next/navigation", () => ({ usePathname }));

describe("AppShell", () => {
  beforeEach(() => usePathname.mockReturnValue("/friends"));

  it("provides all primary destinations and the notification entry", () => {
    render(
      <AppShell>
        <h1>친구</h1>
      </AppShell>,
    );

    expect(screen.getByRole("navigation", { name: "주요 메뉴" })).toBeVisible();
    expect(screen.getByRole("link", { name: "홈" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "친구" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "펫" })).toHaveAttribute("href", "/pet");
    expect(screen.getByRole("link", { name: "내 정보" })).toHaveAttribute("href", "/profile");
    expect(screen.getByRole("link", { name: "알림 열기" })).toHaveAttribute(
      "href",
      "/notifications",
    );
  });
});
