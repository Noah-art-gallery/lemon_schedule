import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { TaskEditor } from "./task-editor";
it("starts with the title and date, while optional fields keep their values across collapse", async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  render(
    <TaskEditor
      initial={{ title: "", dueDate: "2026-10-12", recurrence: "none", dueTime: "" }}
      onSave={save}
      onCancel={vi.fn()}
      onDirtyChange={vi.fn()}
    />,
  );
  await waitFor(() => expect(screen.getByLabelText("할 일")).toHaveFocus());
  expect(screen.getByLabelText("날짜")).toBeVisible();
  expect(screen.getByLabelText("시간 (선택)")).not.toBeVisible();
  fireEvent.change(screen.getByLabelText("할 일"), { target: { value: "내 일정" } });
  fireEvent.click(screen.getByRole("button", { name: /시간·반복/ }));
  fireEvent.change(screen.getByLabelText("시간 (선택)"), { target: { value: "19:30" } });
  fireEvent.change(screen.getByLabelText("반복"), { target: { value: "monthly" } });
  fireEvent.click(screen.getByRole("button", { name: /시간·반복/ }));
  fireEvent.click(screen.getByRole("button", { name: "할 일 추가" }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith({
      title: "내 일정",
      dueDate: "2026-10-12",
      dueTime: "19:30",
      recurrence: "monthly",
    }),
  );
});
it("shows existing time and recurrence when editing and retains input after failure", async () => {
  render(
    <TaskEditor
      editing
      initial={{
        title: "기존 일정",
        dueDate: "2026-01-31",
        recurrence: "monthly",
        dueTime: "19:30",
      }}
      onSave={vi.fn().mockRejectedValue(new Error("저장 실패"))}
      onCancel={vi.fn()}
      onDirtyChange={vi.fn()}
    />,
  );
  expect(screen.getByLabelText("시간 (선택)")).toBeVisible();
  fireEvent.change(screen.getByLabelText("할 일"), { target: { value: "수정한 일정" } });
  fireEvent.click(screen.getByRole("button", { name: "변경 저장" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("저장 실패");
  expect(screen.getByLabelText("할 일")).toHaveValue("수정한 일정");
});
