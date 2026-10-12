import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { HomeScreen } from "./home-screen";
vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
it("loads the demo list and exposes future tasks and deleted completion history", async () => {
  render(<HomeScreen />);
  expect(await screen.findByText("영어 단어 10개")).toBeVisible();
  fireEvent.click(screen.getByRole("tab", { name: "예정" }));
  expect(await screen.findByText("주말 독서")).toBeVisible();
  fireEvent.click(screen.getByRole("tab", { name: "기록" }));
  expect(await screen.findByText("독서 기록 정리")).toBeVisible();
  expect(screen.getByText("삭제된 할 일 · 기록만 보기")).toBeVisible();
});
