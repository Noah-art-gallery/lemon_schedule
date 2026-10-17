import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { demoGetDetail } from "./demo-task-store";
import { TaskRowView } from "./task-row-view";
it("makes a deleted completion read only and keeps title activation separate from completion", () => {
  const detail = demoGetDetail(1);
  const open = vi.fn();
  const toggle = vi.fn();
  render(
    <TaskRowView occurrence={detail.occurrence} taskDeleted onOpen={open} onToggle={toggle} />,
  );
  expect(screen.queryByRole("button", { name: /완료 취소/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /물 2잔/ }));
  expect(open).toHaveBeenCalledOnce();
  expect(toggle).not.toHaveBeenCalled();
});

it("keeps the completion control mounted and renders its feedback without duplicate keys", () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const detail = demoGetDetail(2);
    const open = vi.fn();
    const toggle = vi.fn();
    const view = render(
      <TaskRowView
        occurrence={{ ...detail.occurrence, status: "pending" }}
        onOpen={open}
        onToggle={toggle}
      />,
    );
    const button = screen.getByRole("button", { name: "영어 단어 10개 완료" });
    button.focus();
    view.rerender(
      <TaskRowView
        occurrence={{ ...detail.occurrence, status: "completed" }}
        completionVersion={1}
        onOpen={open}
        onToggle={toggle}
      />,
    );
    expect(screen.getByRole("button", { name: "영어 단어 10개 완료 취소" })).toBe(button);
    expect(button).toHaveFocus();
    expect(error).not.toHaveBeenCalled();
  } finally {
    error.mockRestore();
  }
});
