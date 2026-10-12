import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { NotificationScreen } from "./notification-screen";
import { listInbox, markAllInboxRead, markNotificationRead } from "./notification-service";
import type { InboxItem } from "@/types/contracts";
import { demoGetDetail } from "@/features/tasks/demo-task-store";
const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  userId: "user" as string | null,
  refresh: undefined as undefined | ((invalidate?: boolean) => void),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ demo: false, user: mocks.userId ? { id: mocks.userId } : null }),
}));
vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("./inbox-events", () => ({
  subscribeInbox: (_user: unknown, _demo: unknown, refresh: (invalidate?: boolean) => void) => {
    mocks.refresh = refresh;
    return () => {};
  },
}));
vi.mock("./notification-service", () => ({
  listInbox: vi.fn(),
  markAllInboxRead: vi.fn(),
  markNotificationRead: vi.fn(),
}));
vi.mock("@/features/tasks/occurrence-detail-panel", () => ({
  OccurrenceDetailPanel: ({
    onResolved,
    notice,
  }: {
    onResolved: (detail: ReturnType<typeof demoGetDetail>) => void;
    notice: React.ReactNode;
  }) => (
    <section role="dialog" aria-label="할 일 상세">
      {notice}
      <button onClick={() => onResolved(demoGetDetail(1))}>상세 조회 성공</button>
      <p>상세 내용</p>
      <input aria-label="작성 중인 제목" />
    </section>
  ),
}));
const cheer: InboxItem = {
  id: 9,
  type: "encouragement_received",
  actorName: "지민",
  actorAvatarKey: "cat",
  createdAt: "2026-10-12T00:00:00Z",
  readAt: null,
  occurrenceId: 1,
  encouragementId: 11,
  connectionRequestId: null,
  target: "/?occurrence=1&encouragement=11",
  availability: "available",
  taskTitle: "물 2잔 마시기",
  messagePreview: "잘했어",
  reaction: "clap",
};
const connection: InboxItem = {
  ...cheer,
  id: 8,
  type: "connection_request",
  actorName: "민서",
  occurrenceId: null,
  encouragementId: null,
  connectionRequestId: 41,
  target: "/friends/?request=41",
  taskTitle: null,
  messagePreview: null,
  reaction: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.userId = "user";
  vi.mocked(listInbox).mockImplementation(async ({ filter }) => ({
    items: filter === "connection" ? [connection] : [cheer],
    nextCursor: null,
  }));
  vi.mocked(markNotificationRead).mockResolvedValue(true);
  vi.mocked(markAllInboxRead).mockResolvedValue({ updatedCount: 2, readAt: "now" });
});
it("opens cheers first, marks only after exact detail resolution, and retries failed reads inside detail", async () => {
  vi.mocked(markNotificationRead).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  render(<NotificationScreen />);
  fireEvent.click(await screen.findByRole("button", { name: /지민의 응원/ }));
  expect(markNotificationRead).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "상세 조회 성공" }));
  const retry = await screen.findByRole("button", { name: "읽음 처리 다시 시도" });
  expect(retry.closest('[role="dialog"]')).not.toBeNull();
  expect(screen.getByText("상세 내용")).toBeVisible();
  fireEvent.click(retry);
  await waitFor(() => expect(markNotificationRead).toHaveBeenCalledTimes(2));
});
it("does not open or mark an unavailable target", async () => {
  vi.mocked(listInbox).mockResolvedValue({
    items: [
      {
        ...cheer,
        availability: "unavailable",
        target: null,
        taskTitle: null,
        messagePreview: null,
        reaction: null,
      },
    ],
    nextCursor: null,
  });
  render(<NotificationScreen />);
  fireEvent.click(await screen.findByRole("button", { name: /지금은 확인할 수 없는 소식/ }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(markNotificationRead).not.toHaveBeenCalled();
  expect(screen.queryByText("잘했어")).not.toBeInTheDocument();
});
it("routes connection receipts to their exact request without eagerly reading", async () => {
  render(<NotificationScreen />);
  fireEvent.click(screen.getByRole("button", { name: "연결" }));
  fireEvent.click(await screen.findByRole("button", { name: /민서의 연결 요청/ }));
  expect(mocks.push).toHaveBeenCalledWith("/friends/?request=41&notification=8");
  expect(markNotificationRead).not.toHaveBeenCalled();
});
it("uses the global head as mark-all high-water even from a filtered view", async () => {
  render(<NotificationScreen />);
  fireEvent.click(screen.getByRole("button", { name: "연결" }));
  await screen.findByRole("button", { name: /민서의 연결 요청/ });
  vi.mocked(listInbox).mockImplementation(async ({ filter, limit }) => ({
    items: filter === "all" && limit === 1 ? [{ ...cheer, id: 12 }] : [connection],
    nextCursor: null,
  }));
  fireEvent.click(screen.getByRole("button", { name: "모두 읽음" }));
  await waitFor(() => expect(markAllInboxRead).toHaveBeenCalledWith({ throughId: 12 }));
  expect(listInbox).toHaveBeenCalledWith({ filter: "all", limit: 1 });
});
it("discards late pagination when filters change", async () => {
  let finish!: (result: { items: InboxItem[]; nextCursor: null }) => void;
  vi.mocked(listInbox).mockImplementation(async ({ filter, cursor }) =>
    cursor
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : filter === "all"
        ? { items: [cheer], nextCursor: 9 }
        : { items: [connection], nextCursor: null },
  );
  render(<NotificationScreen />);
  fireEvent.click(await screen.findByRole("button", { name: "이전 소식 더 보기" }));
  fireEvent.click(screen.getByRole("button", { name: "연결" }));
  await screen.findByRole("button", { name: /민서의 연결 요청/ });
  await act(async () =>
    finish({ items: [{ ...cheer, id: 7, taskTitle: "늦은 응답" }], nextCursor: null }),
  );
  expect(screen.queryByText("늦은 응답")).not.toBeInTheDocument();
  expect(screen.queryByText("물 2잔 마시기")).not.toBeInTheDocument();
});

it.each(["second-account", null])(
  "does not mark the previous account after switching or signing out (%s)",
  async (nextAccount) => {
    let finish!: (result: { items: InboxItem[]; nextCursor: null }) => void;
    vi.mocked(listInbox).mockImplementation(async ({ limit }) =>
      limit === 1
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : { items: [cheer], nextCursor: null },
    );
    const view = render(<NotificationScreen />);
    await screen.findByRole("button", { name: /지민의 응원/ });
    fireEvent.click(screen.getByRole("button", { name: "모두 읽음" }));
    await waitFor(() => expect(finish).toBeDefined());
    mocks.userId = nextAccount;
    view.rerender(<NotificationScreen />);
    if (nextAccount) await screen.findByRole("button", { name: /지민의 응원/ });
    await act(async () => finish({ items: [{ ...cheer, id: 99 }], nextCursor: null }));
    expect(markAllInboxRead).not.toHaveBeenCalled();
  },
);

it.each([false, true])(
  "discards older selected detail on permission invalidation even if refresh fails (%s)",
  async (fails) => {
    const older = { ...cheer, id: 7 };
    vi.mocked(listInbox).mockImplementation(async ({ cursor }) =>
      cursor ? { items: [older], nextCursor: null } : { items: [connection], nextCursor: 8 },
    );
    render(<NotificationScreen />);
    fireEvent.click(await screen.findByRole("button", { name: "이전 소식 더 보기" }));
    fireEvent.click(await screen.findByRole("button", { name: /지민의 응원/ }));
    expect(screen.getByRole("dialog")).toBeVisible();
    // The author deletes the cheer. The old item would now resolve unavailable,
    // but page 1 contains only the newer connection notification.
    vi.mocked(listInbox).mockImplementation(async ({ cursor }) =>
      cursor
        ? {
            items: [
              {
                ...older,
                availability: "unavailable",
                target: null,
                taskTitle: null,
                messagePreview: null,
                reaction: null,
              },
            ],
            nextCursor: null,
          }
        : { items: [connection], nextCursor: 8 },
    );
    if (fails) vi.mocked(listInbox).mockRejectedValue(new Error("조회 실패"));
    await act(async () => mocks.refresh?.(true));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  },
);
it("preserves the open detail and row DOM during a read-only refresh", async () => {
  render(<NotificationScreen />);
  const row = await screen.findByRole("button", { name: /지민의 응원/ });
  fireEvent.click(row);
  vi.mocked(listInbox).mockResolvedValue({
    items: [{ ...cheer, readAt: "2026-10-12T01:00:00Z" }],
    nextCursor: null,
  });
  await act(async () => mocks.refresh?.(false));
  expect(screen.getByRole("dialog")).toBeVisible();
  expect(screen.getByRole("button", { name: /지민의 응원/ })).toBe(row);
});

it("preserves an unchanged target draft on a focus refresh", async () => {
  render(<NotificationScreen />);
  fireEvent.click(await screen.findByRole("button", { name: /지민의 응원/ }));
  const input = screen.getByRole("textbox", { name: "작성 중인 제목" });
  fireEvent.change(input, { target: { value: "작성 중인 변경" } });
  await act(async () => mocks.refresh?.(true));
  expect(screen.getByRole("textbox", { name: "작성 중인 제목" })).toBe(input);
  expect(input).toHaveValue("작성 중인 변경");
});
it("revalidates the exact older target and retains its draft when the first page does not contain it", async () => {
  const older = { ...cheer, id: 7 };
  vi.mocked(listInbox).mockImplementation(async ({ cursor }) =>
    cursor ? { items: [older], nextCursor: null } : { items: [connection], nextCursor: 8 },
  );
  render(<NotificationScreen />);
  fireEvent.click(await screen.findByRole("button", { name: "이전 소식 더 보기" }));
  fireEvent.click(await screen.findByRole("button", { name: /지민의 응원/ }));
  const input = screen.getByRole("textbox", { name: "작성 중인 제목" });
  fireEvent.change(input, { target: { value: "오래된 기록 편집 중" } });
  await act(async () => mocks.refresh?.(true));
  expect(listInbox).toHaveBeenCalledWith({ filter: "all", cursor: 8 });
  expect(input).toHaveValue("오래된 기록 편집 중");
  expect(input).toBeInTheDocument();
});
