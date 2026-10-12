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
