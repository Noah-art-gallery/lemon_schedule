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
  it("releases background and scroll locks when stacked panels close together", () => {
    const view = (composer: boolean, confirmation: boolean) => (
      <>
        <button>배경 버튼</button>
        <Panel open={composer} history={false} title="응원 작성" onClose={vi.fn()}>
          <input aria-label="응원" />
        </Panel>
        <Panel open={confirmation} history={false} title="닫기 확인" onClose={vi.fn()}>
          확인
        </Panel>
      </>
    );
    const { container, rerender } = render(view(true, false));
    rerender(view(true, true));
    expect(container.inert).toBe(true);
    rerender(view(false, true));
    expect(container.inert).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    rerender(view(false, false));
    expect(container.inert).not.toBe(true);
    expect(document.body.style.overflow).not.toBe("hidden");
    rerender(view(true, false));
    rerender(view(true, true));
    rerender(view(false, false));
    expect(container.inert).not.toBe(true);
    expect(document.body.style.overflow).not.toBe("hidden");
  });

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

  it("skips controls inside a hidden preserved form when wrapping focus", async () => {
    const user = userEvent.setup();
    render(
      <Panel open title="수정 취소" history={false} onClose={vi.fn()}>
        <button>계속 수정</button>
        <button>수정 취소</button>
        <div hidden>
          <button>기존 폼 저장</button>
        </div>
      </Panel>,
    );
    expect(screen.getByRole("button", { name: "닫기" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "수정 취소" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "닫기" })).toHaveFocus();
  });

  it("includes a details summary in the focus loop but excludes its collapsed contents", async () => {
    const user = userEvent.setup();
    render(
      <Panel open title="할 일" history={false} onClose={vi.fn()}>
        <button>응원</button>
        <details>
          <summary>더보기</summary>
          <button>삭제</button>
        </details>
      </Panel>,
    );
    await user.tab({ shift: true });
    expect(screen.getByText("더보기")).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "닫기" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "응원" })).toHaveFocus();
    await user.tab();
    expect(screen.getByText("더보기")).toHaveFocus();
  });

  it("falls back to a visible control when the requested initial field is hidden", () => {
    function HiddenInitialField() {
      const field = useRef<HTMLInputElement>(null);
      return (
        <Panel open title="수정 취소" history={false} onClose={vi.fn()} initialFocusRef={field}>
          <div hidden>
            <input ref={field} aria-label="보존된 제목" />
          </div>
          <button>계속 수정</button>
        </Panel>
      );
    }
    render(<HiddenInitialField />);
    expect(screen.getByRole("button", { name: "닫기" })).toHaveFocus();
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
