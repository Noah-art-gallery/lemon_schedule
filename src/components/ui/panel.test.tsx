import { StrictMode, useRef, useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Panel } from "@/components/ui/panel";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

function Example() {
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button onClick={() => setOpen(true)}>할 일 열기</button>
      <Panel
        open={open}
        title="할 일"
        onClose={() => setOpen(false)}
        initialFocusRef={input}
        history={false}
      >
        <input ref={input} aria-label="제목" />
        <button>저장</button>
      </Panel>
    </>
  );
}

describe("Panel", () => {
  it("moves focus to the requested field, traps Tab, and restores the trigger on Escape", async () => {
    const user = userEvent.setup();
    render(<Example />);
    const trigger = screen.getByRole("button", { name: "할 일 열기" });
    await user.click(trigger);
    expect(screen.getByRole("textbox", { name: "제목" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "저장" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "닫기" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("allows a dirty form to veto Escape and backdrop dismissal", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Panel open title="할 일 수정" history={false} onClose={onClose} onBeforeClose={() => false}>
        내용
      </Panel>,
    );
    await user.keyboard("{Escape}");
    fireEvent.mouseDown(screen.getByTestId("panel-backdrop"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("handles browser Back as dismissal without navigating away", async () => {
    const onClose = vi.fn();
    const before = window.location.href;
    const { unmount } = render(
      <Panel open title="상세" onClose={onClose}>
        내용
      </Panel>,
    );
    expect(window.location.href).toBe(before);
    await waitFor(() => expect(window.history.state?.lemonPanel).toBeTruthy());
    window.history.back();
    await waitFor(() => expect(onClose).toHaveBeenCalledWith("back"));
    unmount();
  });
  it("keeps a StrictMode panel open and does not let a previous close dismiss a new panel", async () => {
    const onClose = vi.fn();
    const view = (open: boolean) => (
      <StrictMode>
        <Panel open={open} title="상세" onClose={onClose}>
          내용
        </Panel>
      </StrictMode>
    );
    const { rerender, unmount } = render(view(true));
    await waitFor(() => expect(window.history.state?.lemonPanel).toBeTruthy());
    const firstId = window.history.state.lemonPanel;
    expect(onClose).not.toHaveBeenCalled();
    rerender(view(false));
    rerender(view(true));
    await waitFor(() => {
      expect(window.history.state?.lemonPanel).toBeTruthy();
      expect(window.history.state.lemonPanel).not.toBe(firstId);
    });
    expect(onClose).not.toHaveBeenCalled();
    window.history.back();
    await waitFor(() => expect(onClose).toHaveBeenCalledExactlyOnceWith("back"));
    unmount();
  });
});

describe("ConfirmDialog", () => {
  it("starts on Cancel so an immediate Enter does not confirm a destructive action", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        open
        title="민지를 차단할까요?"
        description="연결이 해제돼요"
        confirmLabel="차단"
        onConfirm={onConfirm}
        onCancel={onCancel}
        history={false}
      />,
    );
    expect(screen.getByRole("button", { name: "취소" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("requires explicit confirmation and blocks repeated actions while pending", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const user = userEvent.setup();
    const props = {
      open: true,
      title: "민지를 차단할까요?",
      description: "연결이 해제돼요",
      confirmLabel: "차단",
      onConfirm,
      onCancel,
      history: false,
    };
    const { rerender } = render(<ConfirmDialog {...props} />);
    await user.click(screen.getByRole("button", { name: "차단" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    rerender(<ConfirmDialog {...props} loading />);
    await user.keyboard("{Escape}");
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "취소" })).toBeDisabled();
  });
});
