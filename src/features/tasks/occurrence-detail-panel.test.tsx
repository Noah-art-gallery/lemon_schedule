import { deleteEncouragement } from "@/features/encouragements/encouragement-service";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { OccurrenceDetailPanel } from "./occurrence-detail-panel";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getOccurrenceDetail, completeOccurrence, getTaskSource } from "./task-service";
import { demoGetDetail } from "./demo-task-store";
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ demo: false, user: { id: "demo" } }),
}));
vi.mock("./task-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./task-service")>()),
  getOccurrenceDetail: vi.fn(),
  completeOccurrence: vi.fn(),
  getTaskSource: vi.fn(),
}));
vi.mock("@/features/encouragements/encouragement-service", async (original) => ({
  ...(await original<typeof import("@/features/encouragements/encouragement-service")>()),
  deleteEncouragement: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({ getSupabaseClient: vi.fn() }));
afterEach(() => {
  vi.clearAllMocks();
});
it("ignores an older target response and only resolves the current detail", async () => {
  let resolveFirst!: (value: ReturnType<typeof demoGetDetail>) => void;
  const first = new Promise<ReturnType<typeof demoGetDetail>>((resolve) => {
    resolveFirst = resolve;
  });
  vi.mocked(getOccurrenceDetail).mockImplementation(({ occurrenceId }) =>
    occurrenceId === 1 ? first : Promise.resolve(demoGetDetail(2)),
  );
  const resolved = vi.fn();
  const close = vi.fn();
  const view = render(
    <OccurrenceDetailPanel occurrenceId={1} onClose={close} onResolved={resolved} />,
  );
  await waitFor(() => expect(getOccurrenceDetail).toHaveBeenCalledWith({ occurrenceId: 1 }));
  view.rerender(<OccurrenceDetailPanel occurrenceId={2} onClose={close} onResolved={resolved} />);
  await screen.findByRole("heading", { name: "영어 단어 10개" });
  await act(async () => resolveFirst(demoGetDetail(1)));
  expect(screen.queryByRole("heading", { name: "물 2잔 마시기" })).not.toBeInTheDocument();
  expect(resolved).toHaveBeenCalledTimes(1);
  expect(resolved.mock.calls[0][0].occurrence.id).toBe(2);
});
it("locks completion while the request is pending and retains the prior status on failure", async () => {
  vi.mocked(getOccurrenceDetail).mockResolvedValue(demoGetDetail(2));
  let reject!: (error: Error) => void;
  vi.mocked(completeOccurrence).mockImplementation(
    () =>
      new Promise((_, no) => {
        reject = no;
      }),
  );
  render(<OccurrenceDetailPanel occurrenceId={2} onClose={() => {}} />);
  const button = await screen.findByRole("button", { name: "완료하기" });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(completeOccurrence).toHaveBeenCalledTimes(1);
  await act(async () => reject(new Error("다시 시도해 주세요")));
  await screen.findByRole("alert");
  expect(screen.getByText("진행 중")).toBeInTheDocument();
  expect(button).not.toBeDisabled();
  expect(screen.queryByText("할 일 하나, 해냈어요")).not.toBeInTheDocument();
});

it.each([null, "19:30"])(
  "saves a title and cleared optional time through the real update service (%s)",
  async (time) => {
    vi.mocked(getOccurrenceDetail).mockResolvedValue(demoGetDetail(2));
    vi.mocked(getTaskSource).mockResolvedValue({
      title: "영어 단어 10개",
      dueDate: "2026-01-31",
      dueTime: time ?? "",
      recurrence: "monthly",
    });
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: { taskId: 2, updatedAt: "2026-10-12T00:00:00Z" }, error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ rpc } as unknown as ReturnType<
      typeof getSupabaseClient
    >);
    render(<OccurrenceDetailPanel occurrenceId={2} onClose={() => {}} />);
    await screen.findByRole("heading", { name: "영어 단어 10개" });
    fireEvent.click(screen.getByLabelText("할 일 메뉴"));
    fireEvent.click(screen.getByRole("button", { name: "수정" }));
    const title = await screen.findByLabelText("할 일");
    fireEvent.change(title, { target: { value: "영어 복습" } });
    fireEvent.change(screen.getByLabelText(/시간/), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "변경 저장" }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith(
        "update_task_schedule",
        expect.objectContaining({
          target_title: "영어 복습",
          target_due_date: "2026-01-31",
          target_due_time: null,
          due_time_provided: true,
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "영어 단어 10개" })).toHaveFocus(),
    );
  },
);

it("keeps legacy encouragement read only and requires confirmation before deletion", async () => {
  const detail = demoGetDetail(101);
  const own = {
    ...detail.encouragements[0],
    id: 88,
    author_id: "demo",
    authorName: "나",
    message: "보낸 응원",
  };
  detail.encouragements = [own];
  detail.summary.myEncouragement = {
    id: 88,
    reaction: "heart",
    message: "보낸 응원",
    visibility: "visible",
  };
  vi.mocked(getOccurrenceDetail).mockResolvedValue(detail);
  render(<OccurrenceDetailPanel occurrenceId={101} onClose={() => {}} />);
  await screen.findByText("보낸 응원");
  expect(screen.queryByRole("button", { name: "응원 수정" })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("응원글")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "응원 1개 펼치기" }));
  fireEvent.click(await screen.findByRole("button", { name: "응원 삭제" }));
  expect(deleteEncouragement).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "취소" }));
  expect(screen.getByText("보낸 응원")).toBeVisible();
});

it("keeps received encouragement visible without owner hiding controls", async () => {
  vi.mocked(getOccurrenceDetail).mockResolvedValue(demoGetDetail(1));
  render(<OccurrenceDetailPanel occurrenceId={1} onClose={() => {}} />);
  await screen.findByRole("heading", { name: "물 2잔 마시기" });
  expect(screen.queryByRole("button", { name: "숨기기" })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("지민 응원 메뉴")).not.toBeInTheDocument();
});

it("reports completed status without forcing a list refresh when the home preserves placement", async () => {
  const before = demoGetDetail(2);
  vi.mocked(getOccurrenceDetail).mockResolvedValue(before);
  vi.mocked(completeOccurrence).mockResolvedValue({
    status: "completed",
    completedAt: "2026-10-12T12:00:00Z",
    firstCompletion: false,
    rewardGranted: false,
    rewardPoints: 0,
    completionEventId: 1,
  });
  const changed = vi.fn();
  const completed = vi.fn();
  render(
    <OccurrenceDetailPanel
      occurrenceId={2}
      onClose={vi.fn()}
      onChanged={changed}
      onCompletionChanged={completed}
    />,
  );
  const button = await screen.findByRole("button", { name: "완료하기" });
  button.focus();
  fireEvent.click(button);
  await waitFor(() => expect(completed).toHaveBeenCalledWith(2, "completed"));
  expect(changed).not.toHaveBeenCalled();
  expect(await screen.findByRole("button", { name: "완료 취소" })).toBe(button);
  expect(button).toHaveFocus();
  expect(screen.getByText("할 일 하나, 해냈어요")).toBeVisible();
  expect(screen.queryByText(/성장/)).not.toBeInTheDocument();
  expect(getOccurrenceDetail).toHaveBeenCalledTimes(1);
});

it.each([
  { firstCompletion: true, rewardGranted: true, rewardPoints: 1, rewarded: true },
  { firstCompletion: false, rewardGranted: false, rewardPoints: 0, rewarded: false },
  { firstCompletion: true, rewardGranted: false, rewardPoints: 0, rewarded: false },
])(
  "celebrates only a confirmed completion and shows the granted reward ($rewarded)",
  async ({ rewarded, ...result }) => {
    vi.mocked(getOccurrenceDetail).mockResolvedValue(demoGetDetail(2));
    let resolve!: (value: Awaited<ReturnType<typeof completeOccurrence>>) => void;
    vi.mocked(completeOccurrence).mockImplementation(
      () =>
        new Promise((yes) => {
          resolve = yes;
        }),
    );
    render(<OccurrenceDetailPanel occurrenceId={2} onClose={vi.fn()} />);
    const button = await screen.findByRole("button", { name: "완료하기" });
    button.focus();
    fireEvent.click(button);
    expect(screen.queryByText("할 일 하나, 해냈어요")).not.toBeInTheDocument();
    expect(button).toHaveAttribute("aria-busy", "true");
    await act(async () =>
      resolve({
        ...result,
        status: "completed",
        completedAt: "2026-10-13T00:00:00Z",
        completionEventId: 1,
      }),
    );
    expect(screen.getByText("할 일 하나, 해냈어요")).toBeVisible();
    if (rewarded) expect(screen.getByText(/성장/)).toBeVisible();
    else expect(screen.queryByText(/성장/)).not.toBeInTheDocument();
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute("aria-busy", "false");
  },
);
