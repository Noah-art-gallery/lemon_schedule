import { StrictMode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { demoCreateTask, demoToggleOccurrence } from "@/features/tasks/demo-task-store";
import { HomeScreen } from "./home-screen";
vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
it("loads the demo list and exposes future tasks and deleted completion history", async () => {
  render(
    <StrictMode>
      <HomeScreen />
    </StrictMode>,
  );
  expect(await screen.findByText("영어 단어 10개")).toBeVisible();
  fireEvent.click(screen.getByRole("tab", { name: "예정" }));
  expect(await screen.findByText("주말 독서")).toBeVisible();
  fireEvent.click(screen.getByRole("tab", { name: "기록" }));
  expect(await screen.findByText("독서 기록 정리")).toBeVisible();
  expect(screen.getByText("삭제된 할 일 · 기록만 보기")).toBeVisible();
});

it("keeps more than twenty completion records and distant future tasks reachable", async () => {
  for (let index = 0; index < 25; index++) {
    const id = demoCreateTask({
      title: `보존 기록 ${index}`,
      dueDate: "2024-01-31",
      recurrence: "none",
    });
    demoToggleOccurrence(id);
  }
  demoCreateTask({ title: "먼 미래 일정", dueDate: "2035-01-31", recurrence: "none" });
  render(<HomeScreen />);
  await screen.findByText("영어 단어 10개");
  fireEvent.click(screen.getByRole("tab", { name: "기록" }));
  expect(await screen.findAllByText(/^보존 기록 /)).toHaveLength(25);
  fireEvent.click(screen.getByRole("tab", { name: "예정" }));
  expect(await screen.findByText("먼 미래 일정")).toBeVisible();
});

it("celebrates completion in place and never rewards an undo or recompletion", async () => {
  render(<HomeScreen />);
  const button = await screen.findByRole("button", { name: "영어 단어 10개 완료" });
  button.focus();
  fireEvent.click(button);
  await screen.findByText("할 일 하나, 해냈어요");
  expect(screen.getByText(/성장/)).toBeVisible();
  expect(screen.getByRole("button", { name: "영어 단어 10개 완료 취소" })).toBe(button);
  expect(button).toHaveFocus();
  fireEvent.click(button);
  await screen.findByText("완료를 취소했어요");
  expect(screen.queryByText(/성장/)).not.toBeInTheDocument();
  fireEvent.click(button);
  await screen.findByText("할 일 하나, 해냈어요");
  expect(screen.queryByText(/성장/)).not.toBeInTheDocument();
  await waitFor(() => expect(button).toHaveAttribute("aria-busy", "false"));
  expect(button).toHaveFocus();
});
