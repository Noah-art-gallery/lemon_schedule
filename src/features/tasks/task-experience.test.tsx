import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EncouragementComposer } from "@/features/encouragements/encouragement-composer";
import { TaskEditor } from "./task-editor";

describe("task interaction preservation", () => {
  it("quick reaction preserves the existing sent message instead of submitting an unsent draft", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    render(
      <EncouragementComposer
        existing={{ id: 1, reaction: "heart", message: "기존 응원", visibility: "visible" }}
        onSend={send}
        onDirtyChange={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText("응원글"), { target: { value: "작성 중" } });
    fireEvent.click(screen.getByRole("button", { name: "박수" }));
    await waitFor(() => expect(send).toHaveBeenCalledWith("clap", "기존 응원"));
    expect(screen.getByLabelText("응원글")).toHaveValue("작성 중");
  });
  it("failed send preserves draft and permits retry", async () => {
    const send = vi.fn().mockRejectedValue(new Error("연결을 확인해 주세요"));
    render(<EncouragementComposer existing={null} onSend={send} onDirtyChange={() => {}} />);
    fireEvent.change(screen.getByLabelText("응원글"), { target: { value: "잘했어" } });
    fireEvent.click(screen.getByRole("button", { name: "응원 보내기" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("응원글")).toHaveValue("잘했어");
  });
  it("edits the original monthly anchor and keeps inputs after failure", async () => {
    const save = vi.fn().mockRejectedValue(new Error("저장 실패"));
    render(
      <TaskEditor
        initial={{ title: "독서", dueDate: "2026-01-31", dueTime: "", recurrence: "monthly" }}
        onSave={save}
        onCancel={() => {}}
        onDirtyChange={() => {}}
        editing
      />,
    );
    fireEvent.change(screen.getByLabelText("할 일"), { target: { value: "책 읽기" } });
    fireEvent.click(screen.getByRole("button", { name: "변경 저장" }));
    await screen.findByRole("alert");
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ dueDate: "2026-01-31", title: "책 읽기" }),
    );
    expect(screen.getByLabelText("할 일")).toHaveValue("책 읽기");
  });
});
