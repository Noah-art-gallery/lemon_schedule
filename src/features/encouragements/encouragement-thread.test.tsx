import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { EncouragementThread } from "./encouragement-thread";
import { getOccurrenceDetail } from "@/features/tasks/task-service";
import { sendEncouragement, deleteEncouragement } from "./encouragement-service";
import { demoGetDetail } from "@/features/tasks/demo-task-store";
import { AppError } from "@/lib/errors";
const auth = vi.hoisted(() => ({ id: "demo" }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ demo: false, user: { id: auth.id } }),
}));
vi.mock("@/features/tasks/task-service", async (original) => ({
  ...(await original<typeof import("@/features/tasks/task-service")>()),
  getOccurrenceDetail: vi.fn(),
}));
vi.mock("./encouragement-service", async (original) => ({
  ...(await original<typeof import("./encouragement-service")>()),
  sendEncouragement: vi.fn(),
  deleteEncouragement: vi.fn(),
}));
function detail(id = 101) {
  const value = demoGetDetail(101);
  value.occurrence.id = id;
  return value;
}
beforeEach(() => {
  vi.clearAllMocks();
  auth.id = "demo";
  vi.mocked(getOccurrenceDetail).mockImplementation(async ({ occurrenceId }) =>
    detail(occurrenceId),
  );
});
it("loads only expanded cards, keeps previews on collapse, and never writes on collapse", async () => {
  render(<EncouragementThread occurrenceId={101} summary={detail().summary} />);
  expect(getOccurrenceDetail).not.toHaveBeenCalled();
  const button = screen.getByRole("button", { name: /펼치기/ });
  const preview = screen.getByText(/서연:/);
  fireEvent.click(button);
  await waitFor(() => expect(getOccurrenceDetail).toHaveBeenCalledTimes(1));
  const region = screen.getByRole("region", { name: "응원 내역" });
  expect(button).toHaveAttribute("aria-controls", region.id);
  await within(region).findByText("서연");
  fireEvent.click(button);
  expect(preview).toBeVisible();
  expect(region).not.toBeVisible();
  expect(sendEncouragement).not.toHaveBeenCalled();
  expect(deleteEncouragement).not.toHaveBeenCalled();
  fireEvent.click(button);
  expect(getOccurrenceDetail).toHaveBeenCalledTimes(1);
});
it("keeps independent drafts and reaction choices through collapse, other cards, and unrelated refresh", async () => {
  const props = { summary: detail().summary, canCompose: true };
  const view = render(
    <>
      <section aria-label="첫 카드">
        <EncouragementThread occurrenceId={101} {...props} />
      </section>
      <section aria-label="둘째 카드">
        <EncouragementThread occurrenceId={102} {...props} />
      </section>
    </>,
  );
  const first = within(screen.getByRole("region", { name: "첫 카드" }));
  const second = within(screen.getByRole("region", { name: "둘째 카드" }));
  fireEvent.click(first.getByRole("button", { name: "응원 남기기" }));
  const a = await first.findByLabelText("응원글");
  fireEvent.change(a, { target: { value: "첫 초안" } });
  fireEvent.click(first.getByRole("button", { name: "좋아요" }));
  fireEvent.click(first.getByRole("button", { name: /응원 .*접기/ }));
  fireEvent.click(second.getByRole("button", { name: "응원 남기기" }));
  const b = await second.findByLabelText("응원글");
  fireEvent.change(b, { target: { value: "둘째 초안" } });
  view.rerender(
    <>
      <section aria-label="첫 카드">
        <EncouragementThread occurrenceId={101} {...props} summary={{ ...props.summary }} />
      </section>
      <section aria-label="둘째 카드">
        <EncouragementThread occurrenceId={102} {...props} />
      </section>
    </>,
  );
  fireEvent.click(first.getByRole("button", { name: /펼치기/ }));
  expect(a).toHaveValue("첫 초안");
  expect(b).toHaveValue("둘째 초안");
  expect(first.getByRole("button", { name: "좋아요" })).toHaveAttribute("aria-pressed", "true");
  expect(sendEncouragement).not.toHaveBeenCalled();
});
it("retains failed submissions and locks duplicate sends", async () => {
  let reject!: (error: Error) => void;
  vi.mocked(sendEncouragement).mockImplementation(
    () =>
      new Promise((_, no) => {
        reject = no;
      }),
  );
  render(<EncouragementThread occurrenceId={101} summary={detail().summary} canCompose />);
  fireEvent.click(screen.getByRole("button", { name: "응원 남기기" }));
  const input = await screen.findByLabelText("응원글");
  fireEvent.change(input, { target: { value: "지켜야 할 초안" } });
  const send = screen.getByRole("button", { name: "응원 보내기" });
  fireEvent.click(send);
  fireEvent.click(send);
  expect(sendEncouragement).toHaveBeenCalledTimes(1);
  await act(async () => reject(new AppError("INVALID_INPUT", "저장 실패")));
  expect(input).toHaveValue("지켜야 할 초안");
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
  expect(send).not.toBeDisabled();
});
it("invalidates draft and ignores a late write after account or access changes", async () => {
  let finish!: (id: number) => void;
  vi.mocked(sendEncouragement).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const changed = vi.fn();
  const dirty = vi.fn();
  const view = render(
    <EncouragementThread
      occurrenceId={101}
      summary={detail().summary}
      canCompose
      onChanged={changed}
      onDirtyChange={dirty}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "응원 남기기" }));
  fireEvent.change(await screen.findByLabelText("응원글"), { target: { value: "옛 계정 초안" } });
  fireEvent.click(screen.getByRole("button", { name: "응원 보내기" }));
  auth.id = "new-account";
  view.rerender(
    <EncouragementThread
      occurrenceId={101}
      summary={detail().summary}
      canCompose
      onChanged={changed}
      onDirtyChange={dirty}
    />,
  );
  await act(async () => finish(999));
  expect(changed).not.toHaveBeenCalled();
  expect(dirty).toHaveBeenLastCalledWith(true);
  expect(screen.queryByLabelText("응원글")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "응원 남기기" }));
  expect(await screen.findByLabelText("응원글")).toHaveValue("");
  view.rerender(
    <EncouragementThread occurrenceId={101} summary={detail().summary} accessKey={1} />,
  );
  expect(screen.queryByLabelText("응원글")).not.toBeInTheDocument();
});
it("distinguishes failed and forbidden reads and allows a local retry", async () => {
  vi.mocked(getOccurrenceDetail).mockRejectedValueOnce(
    new AppError("FORBIDDEN", "접근할 수 없어요"),
  );
  render(<EncouragementThread occurrenceId={101} summary={detail().summary} canCompose />);
  fireEvent.click(screen.getByRole("button", { name: /펼치기/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent("접근할 수 없어요");
  expect(screen.queryByRole("button", { name: "응원 남기기" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(await screen.findByText("서연")).toBeVisible();
});
it("uses instance-local deep link focus", async () => {
  const item = detail().encouragements[0];
  render(
    <>
      <section aria-label="목록">
        <EncouragementThread
          occurrenceId={101}
          summary={detail().summary}
          initialDetail={detail()}
        />
      </section>
      <section aria-label="상세">
        <EncouragementThread
          occurrenceId={101}
          summary={detail().summary}
          initialDetail={detail()}
          targetEncouragementId={item.id}
        />
      </section>
    </>,
  );
  await waitFor(() =>
    expect(
      within(screen.getByRole("region", { name: "상세" }))
        .getByText("서연")
        .closest("article"),
    ).toHaveFocus(),
  );
  const ids = Array.from(document.querySelectorAll("[id]"), (element) => element.id);
  expect(new Set(ids).size).toBe(ids.length);
});

it("identifies a deleted deep-link target without hiding remaining encouragements", async () => {
  render(
    <EncouragementThread
      occurrenceId={101}
      summary={detail().summary}
      initialDetail={detail()}
      targetEncouragementId={999999}
    />,
  );
  expect(await screen.findByText("이 응원은 삭제되었거나 볼 수 없어요")).toBeVisible();
  expect(screen.getByText("서연")).toBeVisible();
});

it("restores a valid focus on delete cancellation and updates the thread after confirmed deletion", async () => {
  const original = detail();
  original.encouragements[0].author_id = "demo";
  original.encouragements[0].authorName = "나";
  original.summary.myEncouragement = {
    id: original.encouragements[0].id,
    reaction: "heart",
    message: "내 응원",
    visibility: "visible",
  };
  const changed = vi.fn();
  const empty = {
    ...original,
    encouragements: [],
    summary: { ...original.summary, count: 0, latestMessage: null, myEncouragement: null },
  };
  vi.mocked(getOccurrenceDetail).mockResolvedValueOnce(original).mockResolvedValueOnce(empty);
  vi.mocked(deleteEncouragement).mockResolvedValue({
    encouragementId: original.encouragements[0].id,
    visibility: "deleted_by_author",
  });
  render(
    <EncouragementThread
      occurrenceId={101}
      summary={original.summary}
      canCompose
      onChanged={changed}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /펼치기/ }));
  const remove = await screen.findByRole("button", { name: "응원 삭제" });
  fireEvent.click(remove);
  expect(deleteEncouragement).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "취소" }));
  expect(remove).toHaveFocus();
  fireEvent.click(remove);
  fireEvent.click(screen.getByRole("button", { name: "삭제 확인" }));
  await waitFor(() => expect(changed).toHaveBeenCalledWith(empty));
  expect(screen.getByRole("button", { name: "응원 0개 접기" })).toHaveFocus();
  expect(screen.getByText("아직 응원이 없어요")).toBeVisible();
});
it("refreshes changed content when a previously loaded collapsed thread reopens", async () => {
  const value = detail();
  const view = render(<EncouragementThread occurrenceId={101} summary={value.summary} />);
  fireEvent.click(screen.getByRole("button", { name: /펼치기/ }));
  await screen.findByText("서연");
  fireEvent.click(screen.getByRole("button", { name: /접기/ }));
  const fresh = detail();
  fresh.encouragements[0].message = "수정된 응원";
  fresh.summary.latestMessage = { ...fresh.summary.latestMessage!, message: "수정된 응원" };
  vi.mocked(getOccurrenceDetail).mockResolvedValue(fresh);
  view.rerender(<EncouragementThread occurrenceId={101} summary={fresh.summary} />);
  await waitFor(() => expect(screen.getByText("서연: 수정된 응원")).toBeVisible());
  expect(getOccurrenceDetail).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: /펼치기/ }));
  expect(await screen.findByText("수정된 응원")).toBeVisible();
  expect(getOccurrenceDetail).toHaveBeenCalledTimes(2);
});
it.each(["응원 남기기", "응원 수정"])(
  "refocuses an already open composer on every %s activation without replacing its draft",
  async (label) => {
    const value = detail();
    if (label === "응원 수정")
      value.summary.myEncouragement = {
        id: 90,
        reaction: "heart",
        message: "기존 응원",
        visibility: "visible",
      };
    vi.mocked(getOccurrenceDetail).mockResolvedValue(value);
    render(<EncouragementThread occurrenceId={101} summary={value.summary} canCompose />);
    const enter = screen.getByRole("button", { name: label });
    fireEvent.click(enter);
    const input = await screen.findByLabelText("응원글");
    await waitFor(() => expect(input).toHaveFocus());
    fireEvent.change(input, { target: { value: "작성하던 초안" } });
    enter.focus();
    fireEvent.click(enter);
    expect(input).toHaveFocus();
    expect(input).toHaveValue("작성하던 초안");
    expect(getOccurrenceDetail).toHaveBeenCalledTimes(1);
    expect(sendEncouragement).not.toHaveBeenCalled();
  },
);

it.each(["FORBIDDEN", "NOT_FOUND"] as const)(
  "returns focus to its disclosure after %s removes the active composer",
  async (code) => {
    let reject!: (reason: Error) => void;
    vi.mocked(sendEncouragement).mockImplementation(
      () =>
        new Promise((_, no) => {
          reject = no;
        }),
    );
    const dirty = vi.fn();
    render(
      <EncouragementThread
        occurrenceId={101}
        summary={detail().summary}
        canCompose
        onDirtyChange={dirty}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "응원 남기기" }));
    const input = await screen.findByLabelText("응원글");
    fireEvent.change(input, { target: { value: "전송 중 초안" } });
    const send = screen.getByRole("button", { name: "응원 보내기" });
    send.focus();
    fireEvent.click(send);
    send.blur(); // Model the browser losing focus when the submit button becomes disabled.
    await act(async () => reject(new AppError(code, "더 이상 응원할 수 없어요")));
    expect(screen.queryByLabelText("응원글")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /응원 .*개 접기/ })).toHaveFocus();
    expect(dirty).toHaveBeenLastCalledWith(false);
  },
);
it.each(["another card", "collapsed thread"] as const)(
  "does not reclaim focus after a permission loss when the user moved to %s",
  async (destination) => {
    let reject!: (reason: Error) => void;
    vi.mocked(sendEncouragement).mockImplementation(
      () =>
        new Promise((_, no) => {
          reject = no;
        }),
    );
    render(
      <>
        <EncouragementThread occurrenceId={101} summary={detail().summary} canCompose />
        <button>다른 카드 제목</button>
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "응원 남기기" }));
    fireEvent.change(await screen.findByLabelText("응원글"), { target: { value: "전송 중 초안" } });
    const send = screen.getByRole("button", { name: "응원 보내기" });
    send.focus();
    fireEvent.click(send);
    const disclosure = screen.getByRole("button", { name: /응원 .*개 접기/ });
    const other = screen.getByRole("button", { name: "다른 카드 제목" });
    if (destination === "another card") other.focus();
    else {
      fireEvent.click(disclosure);
      send.blur();
    }
    await act(async () => reject(new AppError("FORBIDDEN", "연결이 해제되었어요")));
    expect(screen.queryByLabelText("응원글")).not.toBeInTheDocument();
    if (destination === "another card") expect(other).toHaveFocus();
    else expect(document.body).toHaveFocus();
  },
);

it("keeps an unsent draft dirty when a save is attempted during a failed delete", async () => {
  const original = structuredClone(detail());
  original.encouragements[0].author_id = "demo";
  original.summary.myEncouragement = {
    id: original.encouragements[0].id,
    reaction: "heart",
    message: "기존에 보낸 글",
    visibility: "visible",
  };
  vi.mocked(getOccurrenceDetail).mockResolvedValue(original);
  let rejectDelete!: (reason: Error) => void;
  vi.mocked(deleteEncouragement).mockImplementation(
    () =>
      new Promise((_, reject) => {
        rejectDelete = reject;
      }),
  );
  vi.mocked(sendEncouragement).mockResolvedValue(original.encouragements[0].id);
  const dirty = vi.fn();
  render(
    <EncouragementThread
      occurrenceId={101}
      summary={original.summary}
      canCompose
      onDirtyChange={dirty}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "응원 수정" }));
  const input = await screen.findByLabelText("응원글");
  fireEvent.change(input, { target: { value: "아직 보내지 않은 초안" } });
  const composer = within(screen.getByRole("region", { name: "응원 남기기" }));
  fireEvent.click(composer.getByRole("button", { name: "박수" }));
  fireEvent.click(screen.getByRole("button", { name: "응원 삭제" }));
  fireEvent.click(screen.getByRole("button", { name: "삭제 확인" }));
  const submit = composer.getByRole("button", { name: "응원 수정" });
  fireEvent.click(submit);
  await act(async () => {});
  expect(sendEncouragement).not.toHaveBeenCalled();
  expect(dirty).toHaveBeenLastCalledWith(true);
  expect(input).toBeDisabled();
  expect(submit).toBeDisabled();
  expect(composer.getByRole("button", { name: "박수" })).toBeDisabled();
  await act(async () => rejectDelete(new AppError("INVALID_INPUT", "삭제 실패")));
  expect(input).toHaveValue("아직 보내지 않은 초안");
  expect(input).not.toBeDisabled();
  expect(dirty).toHaveBeenLastCalledWith(true);
  fireEvent.click(submit);
  await waitFor(() =>
    expect(sendEncouragement).toHaveBeenCalledWith(101, "clap", "아직 보내지 않은 초안"),
  );
  expect(dirty).toHaveBeenLastCalledWith(false);
});

it("rejects a same-batch save when the delete already holds the mutation lock", async () => {
  const original = structuredClone(detail());
  original.encouragements[0].author_id = "demo";
  original.summary.myEncouragement = {
    id: original.encouragements[0].id,
    reaction: "heart",
    message: "보낸 글",
    visibility: "visible",
  };
  vi.mocked(getOccurrenceDetail).mockResolvedValue(original);
  let rejectDelete!: (reason: Error) => void;
  vi.mocked(deleteEncouragement).mockImplementation(
    () =>
      new Promise((_, reject) => {
        rejectDelete = reject;
      }),
  );
  const dirty = vi.fn();
  render(
    <EncouragementThread
      occurrenceId={101}
      summary={original.summary}
      canCompose
      onDirtyChange={dirty}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "응원 수정" }));
  fireEvent.change(await screen.findByLabelText("응원글"), {
    target: { value: "저장되지 않은 글" },
  });
  fireEvent.click(screen.getByRole("button", { name: "응원 삭제" }));
  const submit = within(screen.getByRole("region", { name: "응원 남기기" })).getByRole("button", {
    name: "응원 수정",
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "삭제 확인" }));
    fireEvent.click(submit);
  });
  expect(sendEncouragement).not.toHaveBeenCalled();
  expect(dirty).toHaveBeenLastCalledWith(true);
  expect(screen.getByText("다른 응원을 처리 중이에요. 잠시 후 다시 시도해 주세요")).toBeVisible();
  await act(async () => rejectDelete(new AppError("INVALID_INPUT", "삭제 실패")));
  expect(screen.getByLabelText("응원글")).toHaveValue("저장되지 않은 글");
  expect(dirty).toHaveBeenLastCalledWith(true);
});

it("locks author deletion until the pending encouragement update settles", async () => {
  const original = structuredClone(detail());
  original.encouragements[0].author_id = "demo";
  original.summary.myEncouragement = {
    id: original.encouragements[0].id,
    reaction: "heart",
    message: "보낸 글",
    visibility: "visible",
  };
  vi.mocked(getOccurrenceDetail).mockResolvedValue(original);
  let rejectSend!: (reason: Error) => void;
  vi.mocked(sendEncouragement).mockImplementation(
    () =>
      new Promise((_, reject) => {
        rejectSend = reject;
      }),
  );
  render(<EncouragementThread occurrenceId={101} summary={original.summary} canCompose />);
  fireEvent.click(screen.getByRole("button", { name: "응원 수정" }));
  const input = await screen.findByLabelText("응원글");
  fireEvent.change(input, { target: { value: "수정 중인 글" } });
  const submit = within(screen.getByRole("region", { name: "응원 남기기" })).getByRole("button", {
    name: "응원 수정",
  });
  submit.focus();
  fireEvent.click(submit);
  const remove = screen.getByRole("button", { name: "응원 삭제" });
  expect(remove).toBeDisabled();
  fireEvent.click(remove);
  expect(screen.queryByRole("button", { name: "삭제 확인" })).not.toBeInTheDocument();
  expect(deleteEncouragement).not.toHaveBeenCalled();
  submit.blur();
  await act(async () => rejectSend(new AppError("INVALID_INPUT", "수정 실패")));
  expect(input).toHaveFocus();
  expect(input).toHaveValue("수정 중인 글");
  expect(remove).not.toBeDisabled();
});

it("shows received reactions as images beside the message instead of author-name text suffixes", async () => {
  render(<EncouragementThread occurrenceId={101} summary={detail().summary} />);
  fireEvent.click(screen.getByRole("button", { name: /펼치기/ }));
  const author = await screen.findByText("서연", { exact: true });
  const item = within(author.closest("article")!);
  const image = item.getByRole("img", { name: "좋아요" });
  expect(image).toHaveAttribute("data-sprite", "reaction-heart");
  expect(image).toHaveAttribute("width", "32");
  expect(item.getByText("어려운 문제도 끝까지 풀었네")).toBeVisible();
  expect(screen.queryByText("서연 · 좋아요")).not.toBeInTheDocument();
});
it("shows reaction-only previews as images and counts without opening the thread", () => {
  const summary = {
    ...detail().summary,
    count: 5,
    latestMessage: null,
    reactions: { lemon: 2, clap: 3, heart: 0, cheer: 0 },
  };
  render(<EncouragementThread occurrenceId={101} summary={summary} />);
  expect(
    screen.getByRole("img", { name: "레몬 2개" }).querySelector("[data-sprite]"),
  ).toHaveAttribute("data-sprite", "reaction-lemon");
  expect(
    screen.getByRole("img", { name: "박수 3개" }).querySelector("[data-sprite]"),
  ).toHaveAttribute("data-sprite", "reaction-clap");
  expect(screen.queryByText(/레몬 2.*박수 3/)).not.toBeInTheDocument();
  expect(getOccurrenceDetail).not.toHaveBeenCalled();
});
