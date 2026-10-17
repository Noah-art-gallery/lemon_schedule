import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FeedbackToast, LoadingIndicator, useFeedback } from "@/components/ui/feedback";

function Harness({ title = "저장했어요", rewardPoints = 0 }) {
  const { feedback, showFeedback, dismissFeedback } = useFeedback();
  return (
    <>
      <button onClick={() => showFeedback({ title, kind: "completion", rewardPoints })}>
        {title} 실행
      </button>
      <FeedbackToast feedback={feedback} onDismiss={dismissFeedback} />
    </>
  );
}

afterEach(() => vi.useRealTimers());

describe("FeedbackToast", () => {
  it("gives repeated identical feedback a fresh lifetime", () => {
    vi.useFakeTimers();
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "저장했어요 실행" }));
    act(() => vi.advanceTimersByTime(4000));
    fireEvent.click(screen.getByRole("button", { name: "저장했어요 실행" }));
    act(() => vi.advanceTimersByTime(4000));
    expect(screen.getByRole("status")).toHaveTextContent("저장했어요");
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("pauses the remaining lifetime while hovered or focused", () => {
    vi.useFakeTimers();
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "저장했어요 실행" }));
    const dismiss = screen.getByRole("button", { name: "안내 닫기" });
    act(() => vi.advanceTimersByTime(3000));
    fireEvent.mouseEnter(dismiss);
    act(() => vi.advanceTimersByTime(9000));
    expect(screen.getByRole("status")).toBeInTheDocument();
    fireEvent.focus(dismiss);
    fireEvent.mouseLeave(dismiss);
    act(() => vi.advanceTimersByTime(9000));
    expect(screen.getByRole("status")).toBeInTheDocument();
    fireEvent.blur(dismiss);
    act(() => vi.advanceTimersByTime(1999));
    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows only the newest feedback across multiple local hooks", () => {
    render(
      <>
        <Harness title="첫 번째" />
        <Harness title="두 번째" />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "첫 번째 실행" }));
    fireEvent.click(screen.getByRole("button", { name: "두 번째 실행" }));
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("두 번째");
    fireEvent.click(screen.getByRole("button", { name: "안내 닫기" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("ignores a late callback from an unmounted screen without dismissing the current toast", () => {
    let lateReply: (() => void) | undefined;
    function PreviousScreen() {
      const { showFeedback } = useFeedback();
      return (
        <button
          onClick={() => {
            lateReply = () => showFeedback({ title: "이전 저장" });
          }}
        >
          이전 요청
        </button>
      );
    }
    const previous = render(<PreviousScreen />);
    fireEvent.click(screen.getByRole("button", { name: "이전 요청" }));
    previous.unmount();
    render(<Harness title="새 계정 저장" />);
    fireEvent.click(screen.getByRole("button", { name: "새 계정 저장 실행" }));
    act(() => lateReply?.());
    expect(screen.getByRole("status")).toHaveTextContent("새 계정 저장");
  });

  it("only labels growth when the confirmed reward is positive", () => {
    const { rerender } = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "저장했어요 실행" }));
    expect(screen.getByRole("status")).not.toHaveTextContent("성장");
    rerender(<Harness rewardPoints={10} />);
    fireEvent.click(screen.getByRole("button", { name: "저장했어요 실행" }));
    expect(screen.getByRole("status")).toHaveTextContent("+10 성장");
  });

  it("moves the toast into an opened modal and back when it closes", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "저장했어요 실행" }));
    const modal = document.createElement("div");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    await act(async () => {
      document.body.append(modal);
    });
    expect(within(modal).getByRole("status")).toHaveTextContent("저장했어요");
    expect(within(modal).getByRole("button", { name: "안내 닫기" })).toBeInTheDocument();
    await act(async () => {
      modal.remove();
    });
    expect(screen.getByRole("status")).toHaveTextContent("저장했어요");
  });

  it("announces errors as alerts without stealing focus", () => {
    const onDismiss = vi.fn();
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    render(
      <FeedbackToast
        feedback={{ id: 1, kind: "error", title: "저장하지 못했어요" }}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("저장하지 못했어요");
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});

describe("LoadingIndicator", () => {
  it("announces the current operation", () => {
    render(<LoadingIndicator label="응원을 보내는 중" compact />);
    expect(screen.getByRole("status")).toHaveTextContent("응원을 보내는 중");
  });
});
