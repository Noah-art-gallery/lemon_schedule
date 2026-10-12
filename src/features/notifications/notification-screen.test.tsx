import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { NotificationScreen } from "./notification-screen";
import { listInbox, markAllInboxRead, markNotificationRead } from "./notification-service";
import type { InboxItem } from "@/types/contracts";
import { demoGetDetail } from "@/features/tasks/demo-task-store";
const mocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ demo: false, user: { id: "user" } }),
}));
vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("./inbox-events", () => ({ subscribeInbox: () => () => {} }));
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
    </section>
  ),
}));
const cheer: InboxItem = {
  id: 9,
  type: "encouragement_received",
  actorName: "지민",
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
