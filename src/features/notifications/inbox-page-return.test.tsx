import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { NotificationScreen } from "./notification-screen";
import { listInbox } from "./notification-service";
import { Panel } from "@/components/ui/panel";
import type { InboxItem } from "@/types/contracts";
const m = vi.hoisted(() => ({
  refresh: undefined as undefined | ((invalidate?: boolean) => void),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ demo: false, user: { id: "owner" } }),
}));
vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("./inbox-events", () => ({
  subscribeInbox: (_a: unknown, _b: unknown, refresh: (invalidate?: boolean) => void) => {
    m.refresh = refresh;
    return () => {};
  },
}));
vi.mock("./notification-service", () => ({
  listInbox: vi.fn(),
  markAllInboxRead: vi.fn(),
  markNotificationRead: vi.fn(),
}));
vi.mock("@/features/tasks/occurrence-detail-panel", () => ({
  OccurrenceDetailPanel: ({ onClose }: { onClose: () => void }) => (
    <Panel open title="할 일 상세" history={false} onClose={onClose}>
      <p>선택한 할 일</p>
    </Panel>
  ),
}));
function row(id: number, title: string): InboxItem {
  return {
    id,
    type: "encouragement_received",
    actorName: "친구",
    createdAt: "2026-10-12T00:00:00Z",
    readAt: null,
    occurrenceId: 1,
    encouragementId: 11,
    connectionRequestId: null,
    target: "/?occurrence=1&encouragement=11",
    availability: "available",
    taskTitle: title,
    messagePreview: null,
    reaction: null,
  };
}
beforeEach(() => vi.clearAllMocks());
it("keeps the expanded boundary, opening row and focus through read refresh and continues pagination", async () => {
  let refreshed = false;
  vi.mocked(listInbox).mockImplementation(async ({ cursor }) => {
    if (!cursor)
      return refreshed
        ? { items: [row(14, "새 소식")], nextCursor: 14 }
        : { items: [row(12, "첫 페이지")], nextCursor: 12 };
    if (cursor === 14) return { items: [row(12, "첫 페이지")], nextCursor: 12 };
    if (cursor === 12)
      return {
        items: [{ ...row(10, "둘째 페이지"), readAt: refreshed ? "2026-10-12T01:00:00Z" : null }],
        nextCursor: 10,
      };
    return { items: [row(8, "셋째 페이지")], nextCursor: null };
  });
  render(<NotificationScreen />);
  fireEvent.click(await screen.findByRole("button", { name: "이전 소식 더 보기" }));
  const trigger = await screen.findByRole("button", { name: /둘째 페이지/ });
  trigger.focus();
  fireEvent.click(trigger);
  refreshed = true;
  await act(async () => m.refresh?.(false));
  fireEvent.click(screen.getByRole("button", { name: "닫기" }));
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(screen.getByRole("button", { name: /둘째 페이지/ })).toBe(trigger);
  expect(trigger.querySelector('[aria-label="읽지 않음"]')).toBeNull();
  expect(screen.getByRole("button", { name: /새 소식/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "이전 소식 더 보기" }));
  await screen.findByRole("button", { name: /셋째 페이지/ });
  expect(listInbox).toHaveBeenLastCalledWith({ filter: "all", cursor: 10 });
  expect(screen.getAllByRole("button", { name: /둘째 페이지/ })).toHaveLength(1);
  expect(screen.queryByRole("button", { name: "이전 소식 더 보기" })).not.toBeInTheDocument();
});
it("discards expanded cached previews and the selected target after access invalidation", async () => {
  let revoked = false;
  vi.mocked(listInbox).mockImplementation(async ({ cursor }) =>
    cursor
      ? {
          items: [
            revoked
              ? { ...row(10, ""), taskTitle: null, availability: "unavailable", target: null }
              : row(10, "민감한 이전 소식"),
          ],
          nextCursor: null,
        }
      : { items: [row(12, "최신 소식")], nextCursor: 12 },
  );
  render(<NotificationScreen />);
  fireEvent.click(await screen.findByRole("button", { name: "이전 소식 더 보기" }));
  fireEvent.click(await screen.findByRole("button", { name: /민감한 이전 소식/ }));
  revoked = true;
  await act(async () => m.refresh?.(true));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByText("민감한 이전 소식")).not.toBeInTheDocument();
  expect(listInbox).toHaveBeenCalledWith({ filter: "all", cursor: 12 });
});

it("returns to the revalidated page-two row after a normal focus refresh", async () => {
  let refreshed = false;
  let finish!: (page: { items: InboxItem[]; nextCursor: number }) => void;
  vi.mocked(listInbox).mockImplementation(async ({ cursor }) =>
    cursor
      ? { items: [row(10, "열었던 소식")], nextCursor: null }
      : refreshed
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : { items: [row(12, "최신 소식")], nextCursor: 12 },
  );
  render(<NotificationScreen />);
  fireEvent.click(await screen.findByRole("button", { name: "이전 소식 더 보기" }));
  const trigger = await screen.findByRole("button", { name: /열었던 소식/ });
  trigger.focus();
  fireEvent.click(trigger);
  refreshed = true;
  await act(async () => m.refresh?.(true));
  expect(trigger).not.toBeInTheDocument();
  await act(async () => finish({ items: [row(12, "최신 소식")], nextCursor: 12 }));
  fireEvent.click(screen.getByRole("button", { name: "닫기" }));
  const replacement = screen.getByRole("button", { name: /열었던 소식/ });
  expect(replacement).not.toBe(trigger);
  await waitFor(() => expect(replacement).toHaveFocus());
});
it("clears previews during invalidation and closes detail if revalidation fails", async () => {
  vi.mocked(listInbox).mockImplementation(async ({ cursor }) =>
    cursor
      ? { items: [row(10, "민감한 이전 소식")], nextCursor: null }
      : { items: [row(12, "최신 소식")], nextCursor: 12 },
  );
  render(<NotificationScreen />);
  fireEvent.click(await screen.findByRole("button", { name: "이전 소식 더 보기" }));
  const trigger = await screen.findByRole("button", { name: /민감한 이전 소식/ });
  fireEvent.click(trigger);
  let fail!: (error: Error) => void;
  vi.mocked(listInbox).mockImplementation(
    () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
  );
  await act(async () => m.refresh?.(true));
  expect(trigger).not.toBeInTheDocument();
  expect(screen.queryByText("민감한 이전 소식")).not.toBeInTheDocument();
  await act(async () => fail(new Error("조회 실패")));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByText("민감한 이전 소식")).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "전체" })).toHaveFocus());
});
