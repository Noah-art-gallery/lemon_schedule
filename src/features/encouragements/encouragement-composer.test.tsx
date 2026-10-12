import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { EncouragementComposer } from "./encouragement-composer";
it("selects a reaction without sending and preserves the draft until explicit submit", async () => {
  const send = vi.fn().mockResolvedValue(undefined);
  render(
    <EncouragementComposer
      existing={{ id: 1, reaction: "heart", message: "보낸 글", visibility: "visible" }}
      onSend={send}
      onDirtyChange={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText("응원글"), { target: { value: "새 글" } });
  fireEvent.click(screen.getByRole("button", { name: "박수" }));
  expect(send).not.toHaveBeenCalled();
  expect(screen.getByLabelText("응원글")).toHaveValue("새 글");
  fireEvent.click(screen.getByRole("button", { name: "응원 수정" }));
  await waitFor(() => expect(send).toHaveBeenCalledWith("clap", "새 글"));
});

it.each([false, true])(
  "restores composer focus after a settled request (failure: %s)",
  async (failure) => {
    let settle!: () => void;
    const send = vi.fn(
      () =>
        new Promise<void>((resolve, reject) => {
          settle = () => (failure ? reject(new Error("전송 실패")) : resolve());
        }),
    );
    render(<EncouragementComposer existing={null} onSend={send} onDirtyChange={vi.fn()} />);
    const input = screen.getByLabelText("응원글");
    fireEvent.change(input, { target: { value: "수고했어" } });
    const submit = screen.getByRole("button", { name: "응원 보내기" });
    submit.focus();
    fireEvent.click(submit);
    submit.blur();
    await act(async () => settle());
    expect(input).toHaveFocus();
    expect(input).toHaveValue("수고했어");
  },
);

it("does not take focus back from another card after saving", async () => {
  let settle!: () => void;
  render(
    <>
      <button>다른 할 일</button>
      <EncouragementComposer
        existing={null}
        onSend={() =>
          new Promise<void>((resolve) => {
            settle = resolve;
          })
        }
        onDirtyChange={vi.fn()}
      />
    </>,
  );
  fireEvent.change(screen.getByLabelText("응원글"), { target: { value: "수고했어" } });
  const submit = screen.getByRole("button", { name: "응원 보내기" });
  submit.focus();
  fireEvent.click(submit);
  const other = screen.getByRole("button", { name: "다른 할 일" });
  other.focus();
  await act(async () => settle());
  expect(other).toHaveFocus();
});

it("uses four named color image choices without visible reaction-name text", () => {
  const send = vi.fn();
  render(<EncouragementComposer existing={null} onSend={send} onDirtyChange={vi.fn()} />);
  for (const [label, file] of [
    ["레몬", "lemon"],
    ["박수", "clap"],
    ["좋아요", "heart"],
    ["응원", "cheer"],
  ]) {
    const choice = screen.getByRole("button", { name: label });
    const image = choice.querySelector("img");
    expect(choice).toHaveAttribute("title", label);
    expect(choice.textContent).toBe("");
    expect(image).toHaveAttribute("src", `/reactions/${file}.svg`);
    expect(image).toHaveAttribute("width", "32");
    expect(image).toHaveAttribute("height", "32");
    expect(image).toHaveAttribute("alt", "");
  }
  const clap = screen.getByRole("button", { name: "박수" });
  fireEvent.click(clap);
  expect(clap).toHaveAttribute("aria-pressed", "true");
  expect(clap.querySelector("svg")).toBeInTheDocument();
  expect(send).not.toHaveBeenCalled();
});
