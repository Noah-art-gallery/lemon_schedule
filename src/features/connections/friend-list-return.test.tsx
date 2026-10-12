import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { FriendsScreen } from "./friends-screen";
import { getConnectionData, listSocialActivity, type ConnectionChange } from "./connection-service";
import { listOccurrenceWindow } from "@/features/tasks/task-service";
import { demoListSocial } from "@/features/tasks/demo-task-store";
const reviewAuth = vi.hoisted(() => ({ id: "demo" as string | null }));
const realtime = vi.hoisted(() => ({
  listener: null as null | ((event: ConnectionChange) => void),
  stop: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ demo: false, user: reviewAuth.id ? { id: reviewAuth.id } : null }),
}));
vi.mock("./connection-service", () => ({
  getConnectionData: vi.fn(),
  subscribeConnectionChanges: vi.fn((_id, listener) => {
    realtime.listener = listener;
    return realtime.stop;
  }),
  listSocialActivity: vi.fn(),
  blockFriend: vi.fn(),
  disconnectFriend: vi.fn(),
  respondToConnectionRequest: vi.fn(),
  cancelConnectionRequest: vi.fn(),
  sendConnectionRequest: vi.fn(),
}));
vi.mock("@/features/profile/profile-service", () => ({
  getProfileDetails: vi.fn().mockResolvedValue({ inviteCode: "CODE1234" }),
}));
vi.mock("@/features/tasks/task-service", () => ({
  listOccurrenceWindow: vi.fn().mockResolvedValue({ today: "2026-10-12", occurrences: [] }),
}));
vi.mock("@/features/encouragements/encouragement-service", async (original) => ({
  ...(await original<typeof import("@/features/encouragements/encouragement-service")>()),
  listEncouragementSummaries: vi.fn().mockResolvedValue({ items: [] }),
  sendEncouragement: vi.fn(),
}));
vi.mock("@/features/notifications/inbox-read-receipt", () => ({ InboxReadReceipt: () => null }));
vi.mock("@/features/tasks/occurrence-detail-panel", async () => {
  const { Panel } = await import("@/components/ui/panel");
  return {
    OccurrenceDetailPanel: ({
      onChanged,
      onClose,
    }: {
      onChanged: () => void;
      onClose: () => void;
    }) => (
      <Panel open history={false} title="상세" onClose={onClose}>
        <button onClick={onChanged}>응원 변경 완료</button>
      </Panel>
    ),
  };
});
beforeEach(() => {
  vi.clearAllMocks();
  reviewAuth.id = "demo";
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.mocked(listOccurrenceWindow).mockResolvedValue({ today: "2026-10-12", occurrences: [] });
  vi.mocked(getConnectionData).mockResolvedValue({
    friends: [{ id: "demo-friend-1", connectionId: 71, displayName: "지민", avatarKey: "lemon" }],
    incoming: [],
    outgoing: [],
  });
  vi.mocked(listSocialActivity).mockResolvedValue({
    items: demoListSocial("demo-friend-1"),
    nextCursor: null,
  });
});
it.each([
  { mode: "activity", removed: false },
  { mode: "friend-history", removed: false },
  { mode: "activity", removed: true },
  { mode: "friend-history", removed: true },
])(
  "refreshes through the prior boundary after insertion ($mode, removed=$removed)",
  async ({ mode, removed }) => {
    const seed = demoListSocial("demo-friend-1")[0];
    const row = (id: number, title: string) => ({
      ...seed,
      occurrence: { ...seed.occurrence, id, title_snapshot: title },
    });
    const cursor = (id: number) => ({
      firstCompletedAt: seed.occurrence.first_completed_at!,
      occurrenceId: id,
    });
    let fresh = false;
    vi.mocked(listSocialActivity).mockImplementation(async (input) => {
      const id = input?.cursor?.occurrenceId;
      if (!id)
        return fresh
          ? { items: [row(103, "새 완료")], nextCursor: cursor(103) }
          : { items: [row(101, "최근 완료 항목")], nextCursor: cursor(101) };
      if (id === 103) return { items: [row(101, "최근 완료 항목")], nextCursor: cursor(101) };
      return {
        items: [fresh && removed ? row(98, "경계보다 이전 완료") : row(99, "이전 페이지 완료")],
        nextCursor: null,
      };
    });
    render(<FriendsScreen />);
    await screen.findByText("최근 완료 항목");
    if (mode === "friend-history") {
      fireEvent.click(screen.getByRole("button", { name: "지민" }));
      await waitFor(() => expect(screen.getByRole("tab", { name: "기록" })).not.toBeDisabled());
      fireEvent.click(screen.getByRole("tab", { name: "기록" }));
    }
    fireEvent.click(
      await screen.findByRole("button", {
        name: mode === "activity" ? "활동 더 보기" : "기록 더 보기",
      }),
    );
    const trigger = await screen.findByRole("button", { name: /이전 페이지 완료/ });
    trigger.focus();
    fireEvent.click(trigger);
    fresh = true;
    fireEvent.click(screen.getByRole("button", { name: "응원 변경 완료" }));
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    if (removed) {
      expect(await screen.findByRole("button", { name: /경계보다 이전 완료/ })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /이전 페이지 완료/ })).not.toBeInTheDocument();
    } else expect(screen.queryByRole("button", { name: /이전 페이지 완료/ })).not.toBeNull();
  },
);
it("returns focus to the selected friend after leaving their overview", async () => {
  render(<FriendsScreen />);
  const trigger = await screen.findByRole("button", { name: "지민" });
  trigger.focus();
  fireEvent.click(trigger);
  const back = await screen.findByRole("button", { name: "친구 목록으로" });
  back.focus();
  fireEvent.click(back);
  expect(screen.getByRole("button", { name: "지민" })).toHaveFocus();
});
