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
it("distinguishes failed and forbidden reads and allows a local retry", async () => {
  vi.mocked(getOccurrenceDetail).mockRejectedValueOnce(
    new AppError("FORBIDDEN", "접근할 수 없어요"),
  );
  render(<EncouragementThread occurrenceId={101} summary={detail().summary} />);
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

it("keeps old records readable without a compose action and preserves author deletion", async () => {
  const original = detail();
  original.encouragements[0].author_id = "demo";
  vi.mocked(getOccurrenceDetail).mockResolvedValue(original);
  const changed = vi.fn();
  render(<EncouragementThread occurrenceId={101} summary={original.summary} onChanged={changed} />);
  fireEvent.click(screen.getByRole("button", { name: /펼치기/ }));
  const remove = await screen.findByRole("button", { name: "응원 삭제" });
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "응원 남기기" })).not.toBeInTheDocument();
  fireEvent.click(remove);
  expect(screen.getByRole("button", { name: "취소" })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "취소" }));
  expect(remove).toHaveFocus();
  expect(deleteEncouragement).not.toHaveBeenCalled();
  fireEvent.click(remove);
  const fresh = detail();
  fresh.encouragements = [];
  fresh.summary = { ...fresh.summary, count: 0, latestMessage: null, myEncouragement: null };
  vi.mocked(getOccurrenceDetail).mockResolvedValue(fresh);
  fireEvent.click(screen.getByRole("button", { name: "삭제하기" }));
  await waitFor(() => expect(changed).toHaveBeenCalledWith(fresh));
  expect(deleteEncouragement).toHaveBeenCalledWith(original.encouragements[0].id);
  expect(screen.getByRole("button", { name: /응원 0개 접기/ })).toHaveFocus();
});

it("preserves records after failed deletion and prevents duplicate requests", async () => {
  const original = detail();
  original.encouragements[0].author_id = "demo";
  vi.mocked(getOccurrenceDetail).mockResolvedValue(original);
  let reject!: (reason: Error) => void;
  vi.mocked(deleteEncouragement).mockImplementation(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  render(<EncouragementThread occurrenceId={101} summary={original.summary} />);
  fireEvent.click(screen.getByRole("button", { name: /펼치기/ }));
  fireEvent.click(await screen.findByRole("button", { name: "응원 삭제" }));
  const confirm = screen.getByRole("button", { name: "삭제하기" });
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  expect(deleteEncouragement).toHaveBeenCalledOnce();
  await act(async () => reject(new AppError("INVALID_INPUT", "삭제 실패")));
  expect(screen.getByRole("alert")).toHaveTextContent("삭제 실패");
  expect(screen.getByRole("button", { name: "응원 삭제" })).toBeEnabled();
  expect(confirm).toBeEnabled();
});
