import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { HomeScreen } from "./home-screen";
import { demoGetDetail } from "@/features/tasks/demo-task-store";
import { listOccurrenceWindow } from "@/features/tasks/task-service";
import { AppError } from "@/lib/errors";
const auth = vi.hoisted(() => ({ user: { id: "owner" } }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ demo: false, user: auth.user }),
}));
vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/features/tasks/task-service", async (original) => ({
  ...(await original<typeof import("@/features/tasks/task-service")>()),
  listOccurrenceWindow: vi.fn(),
}));
vi.mock("@/features/encouragements/encouragement-service", () => ({
  listEncouragementSummaries: vi.fn().mockResolvedValue({ items: [] }),
}));
vi.mock("@/features/pet/pet-service", () => ({
  getPetDetails: vi.fn().mockRejectedValue(new Error()),
  getPetDrawingUrl: vi.fn(),
}));
vi.mock("@/features/tasks/occurrence-detail-panel", async () => {
  const { Panel } = await import("@/components/ui/panel");
  return {
    OccurrenceDetailPanel: ({
      occurrenceId,
      onChanged,
      onClose,
    }: {
      occurrenceId: number | null;
      onChanged: () => void;
      onClose: () => void;
    }) => (
      <Panel open={occurrenceId !== null} title="할 일 상세" onClose={onClose}>
        <button onClick={onChanged}>상세 변경 완료</button>
      </Panel>
    ),
  };
});
function initial() {
  const row = demoGetDetail(2).occurrence;
  return { today: row.occurrence_date, occurrences: [row] };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listOccurrenceWindow).mockResolvedValue(initial());
});
async function openDetail() {
  render(<HomeScreen />);
  const trigger = await screen.findByRole("button", { name: "영어 단어 10개" });
  trigger.focus();
  fireEvent.click(trigger);
  return trigger;
}
it("keeps the source row mounted across an asynchronous refresh and restores focus when the detail closes", async () => {
  const trigger = await openDetail();
  let finish!: (value: ReturnType<typeof initial>) => void;
  vi.mocked(listOccurrenceWindow).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  fireEvent.click(screen.getByRole("button", { name: "상세 변경 완료" }));
  await waitFor(() => expect(finish).toBeDefined());
  expect(trigger).toBeInTheDocument();
  const updated = initial();
  updated.occurrences[0].title_snapshot = "영어 복습 20개";
  await act(async () => finish(updated));
  expect(trigger).toHaveTextContent("영어 복습 20개");
  fireEvent.click(screen.getByRole("button", { name: "닫기" }));
  expect(trigger).toHaveFocus();
});
it("shows initial loading without claiming the list is empty", async () => {
  let finish!: (value: ReturnType<typeof initial>) => void;
  vi.mocked(listOccurrenceWindow).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<HomeScreen />);
  await waitFor(() => expect(finish).toBeDefined());
  expect(screen.getByText("할 일 불러오는 중")).toBeInTheDocument();
  expect(screen.queryByText("오늘 할 일이 없어요")).not.toBeInTheDocument();
  await act(async () => finish(initial()));
  expect(await screen.findByRole("button", { name: "영어 단어 10개" })).toBeInTheDocument();
});
it("clears obsolete rows on a failed permission refresh and offers retry without a misleading empty state", async () => {
  const trigger = await openDetail();
  let fail!: (reason: Error) => void;
  vi.mocked(listOccurrenceWindow).mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        fail = reject;
      }),
  );
  fireEvent.click(screen.getByRole("button", { name: "상세 변경 완료" }));
  await waitFor(() => expect(fail).toBeDefined());
  await act(async () => fail(new AppError("FORBIDDEN", "이 목록을 볼 수 없어요")));
  fireEvent.click(screen.getByRole("button", { name: "닫기" }));
  expect(trigger).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("이 목록을 볼 수 없어요");
  expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
  expect(screen.queryByText("오늘 할 일이 없어요")).not.toBeInTheDocument();
});
it("removes a row when a successful refresh confirms deletion", async () => {
  const trigger = await openDetail();
  vi.mocked(listOccurrenceWindow).mockResolvedValueOnce({
    today: initial().today,
    occurrences: [],
  });
  fireEvent.click(screen.getByRole("button", { name: "상세 변경 완료" }));
  await waitFor(() => expect(trigger).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "닫기" }));
  expect(screen.queryByText("영어 단어 10개")).not.toBeInTheDocument();
  expect(screen.getByText("오늘 할 일이 없어요")).toBeInTheDocument();
});
it.each(["move", "complete"])(
  "restores a valid focus target when an overdue row changes groups (%s)",
  async (change) => {
    const data = initial();
    data.occurrences[0].occurrence_date = "2020-01-01";
    vi.mocked(listOccurrenceWindow).mockResolvedValueOnce(data);
    const trigger = await openDetail();
    const updated = initial();
    if (change === "complete") {
      updated.occurrences[0].occurrence_date = "2020-01-01";
      updated.occurrences[0].status = "completed";
    }
    vi.mocked(listOccurrenceWindow).mockResolvedValueOnce(updated);
    fireEvent.click(screen.getByRole("button", { name: "상세 변경 완료" }));
    await waitFor(() => expect(trigger).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    const destination = screen.getByRole("button", {
      name: change === "move" ? "영어 단어 10개" : "할 일 추가",
    });
    await waitFor(() => expect(destination).toHaveFocus());
  },
);
it("keeps return focus valid if the detail closes before a grouped refresh finishes", async () => {
  const data = initial();
  data.occurrences[0].occurrence_date = "2020-01-01";
  vi.mocked(listOccurrenceWindow).mockResolvedValueOnce(data);
  const trigger = await openDetail();
  let finish!: (value: ReturnType<typeof initial>) => void;
  vi.mocked(listOccurrenceWindow).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  fireEvent.click(screen.getByRole("button", { name: "상세 변경 완료" }));
  await waitFor(() => expect(finish).toBeDefined());
  fireEvent.click(screen.getByRole("button", { name: "닫기" }));
  expect(trigger).toHaveFocus();
  await act(async () => finish(initial()));
  const moved = screen.getByRole("button", { name: "영어 단어 10개" });
  expect(moved).not.toBe(trigger);
  await waitFor(() => expect(moved).toHaveFocus());
});
it("cancels a queued return focus when the account's screen unmounts", async () => {
  const view = render(<HomeScreen />);
  const trigger = await screen.findByRole("button", { name: "영어 단어 10개" });
  trigger.focus();
  fireEvent.click(trigger);
  const queued: Array<() => void> = [];
  const queue = vi.spyOn(globalThis, "queueMicrotask").mockImplementation((callback) => {
    queued.push(callback);
  });
  try {
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    view.unmount();
    render(<button data-occurrence-trigger="2">새 계정의 행</button>);
    await act(async () => queued.forEach((callback) => callback()));
    expect(screen.getByRole("button", { name: "새 계정의 행" })).not.toHaveFocus();
  } finally {
    queue.mockRestore();
  }
});
