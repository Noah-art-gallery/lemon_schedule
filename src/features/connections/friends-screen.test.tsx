import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { FriendsScreen } from "./friends-screen";
import { blockFriend, getConnectionData, listSocialActivity } from "./connection-service";
import { listOccurrenceWindow } from "@/features/tasks/task-service";
import {
  listEncouragementSummaries,
  sendEncouragement,
} from "@/features/encouragements/encouragement-service";
import { demoListSocial } from "@/features/tasks/demo-task-store";
const reviewAuth = vi.hoisted(() => ({ id: "demo" as string | null }));
const realtime = vi.hoisted(() => ({
  listener: null as null | ((kind: "connection" | "request") => void),
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
beforeEach(() => {
  vi.clearAllMocks();
  reviewAuth.id = "demo";
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.mocked(listOccurrenceWindow).mockResolvedValue({ today: "2026-10-12", occurrences: [] });
  vi.mocked(getConnectionData).mockResolvedValue({
    friends: [{ id: "demo-friend-1", displayName: "지민" }],
    incoming: [],
    outgoing: [],
  });
  vi.mocked(listSocialActivity).mockResolvedValue({
    items: demoListSocial("demo-friend-1"),
    nextCursor: null,
  });
});
it("keeps blocking inside friend management and cancellation preserves connection", async () => {
  render(<FriendsScreen />);
  await screen.findByText("수학 문제 5개 풀기");
  expect(screen.queryByRole("button", { name: "차단" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "지민" }));
  await screen.findByLabelText("친구 관리");
  fireEvent.click(screen.getByLabelText("친구 관리"));
  fireEvent.click(screen.getByRole("button", { name: "차단" }));
  expect(screen.getByRole("button", { name: "취소" })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "취소" }));
  expect(blockFriend).not.toHaveBeenCalled();
  expect(screen.getByRole("heading", { name: "지민" })).toBeInTheDocument();
});
it("locks destructive submission and retains the friend on request failure", async () => {
  let reject!: (reason: Error) => void;
  vi.mocked(blockFriend).mockImplementation(
    () =>
      new Promise((_, no) => {
        reject = no;
      }),
  );
  render(<FriendsScreen />);
  await screen.findByText("수학 문제 5개 풀기");
  fireEvent.click(screen.getByRole("button", { name: "지민" }));
  fireEvent.click(await screen.findByLabelText("친구 관리"));
  fireEvent.click(screen.getByRole("button", { name: "차단" }));
  const confirm = screen.getByRole("button", { name: "차단하기" });
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  expect(blockFriend).toHaveBeenCalledTimes(1);
  await act(async () => reject(new Error("연결 실패")));
  await screen.findByText("연결 실패");
  expect(confirm).not.toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "취소" }));
  expect(screen.getByRole("heading", { name: "지민" })).toBeInTheDocument();
});
it("loads the next activity cursor and keeps the already visible activities", async () => {
  const first = demoListSocial("demo-friend-1")[0];
  vi.mocked(listSocialActivity)
    .mockResolvedValueOnce({
      items: [first],
      nextCursor: { firstCompletedAt: first.occurrence.first_completed_at!, occurrenceId: 101 },
    })
    .mockResolvedValue({ items: [], nextCursor: null });
  render(<FriendsScreen />);
  fireEvent.click(await screen.findByRole("button", { name: "활동 더 보기" }));
  await waitFor(() =>
    expect(listSocialActivity).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cursor: { firstCompletedAt: first.occurrence.first_completed_at!, occurrenceId: 101 },
      }),
    ),
  );
  expect(screen.getByText("수학 문제 5개 풀기")).toBeInTheDocument();
});
it("removes a successfully disconnected friend and their cached activity", async () => {
  vi.mocked(blockFriend).mockResolvedValue({ blocked: true });
  render(<FriendsScreen />);
  await screen.findByText("수학 문제 5개 풀기");
  fireEvent.click(screen.getByRole("button", { name: "지민" }));
  fireEvent.click(await screen.findByLabelText("친구 관리"));
  fireEvent.click(screen.getByRole("button", { name: "차단" }));
  vi.mocked(getConnectionData).mockResolvedValue({ friends: [], incoming: [], outgoing: [] });
  fireEvent.click(screen.getByRole("button", { name: "차단하기" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.queryByText("수학 문제 5개 풀기")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "지민" })).not.toBeInTheDocument();
});
it("invalidates the selected friend's view when a refreshed relationship is gone", async () => {
  render(<FriendsScreen />);
  await screen.findByText("수학 문제 5개 풀기");
  fireEvent.click(screen.getByRole("button", { name: "지민" }));
  await screen.findByRole("heading", { name: "지민" });
  vi.mocked(getConnectionData).mockResolvedValue({ friends: [], incoming: [], outgoing: [] });
  fireEvent(window, new Event("focus"));
  await screen.findByText("연결이 해제되어 더 이상 할 일을 볼 수 없어요");
  expect(screen.queryByRole("heading", { name: "지민" })).not.toBeInTheDocument();
  expect(screen.queryByText("수학 문제 5개 풀기")).not.toBeInTheDocument();
});
it("preserves an existing message when sending a quick reaction", async () => {
  const summary = demoListSocial("demo-friend-1")[0].summary;
  vi.mocked(listEncouragementSummaries).mockResolvedValue({
    items: [
      {
        occurrenceId: 101,
        summary: {
          ...summary,
          myEncouragement: {
            id: 90,
            reaction: "heart",
            message: "keep my message",
            visibility: "visible",
          },
        },
      },
    ],
  });
  render(<FriendsScreen />);
  fireEvent.click(await screen.findByRole("button", { name: "박수" }));
  await waitFor(() =>
    expect(sendEncouragement).toHaveBeenCalledWith(101, "clap", "keep my message"),
  );
});
it("ignores an old friend response after returning to the activity feed", async () => {
  let resolve!: (value: Awaited<ReturnType<typeof listOccurrenceWindow>>) => void;
  vi.mocked(listOccurrenceWindow).mockImplementationOnce(
    () =>
      new Promise((yes) => {
        resolve = yes;
      }),
  );
  render(<FriendsScreen />);
  await screen.findByText("수학 문제 5개 풀기");
  fireEvent.click(screen.getByRole("button", { name: "지민" }));
  await waitFor(() => expect(listOccurrenceWindow).toHaveBeenCalled());
  fireEvent.click(screen.getByLabelText("친구 목록으로"));
  await act(async () => resolve({ today: "2026-10-12", occurrences: [] }));
  expect(screen.queryByRole("heading", { name: "지민" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "최근 완료" })).toBeInTheDocument();
});
it("expands the future range beyond a year using the owner's today", async () => {
  render(<FriendsScreen />);
  await screen.findByText("수학 문제 5개 풀기");
  fireEvent.click(screen.getByRole("button", { name: "지민" }));
  await waitFor(() => expect(screen.getByRole("tab", { name: "예정" })).not.toBeDisabled());
  fireEvent.click(screen.getByRole("tab", { name: "예정" }));
  const more = screen.getByRole("button", { name: "다음 1년 보기" });
  fireEvent.click(more);
  await waitFor(() =>
    expect(listOccurrenceWindow).toHaveBeenLastCalledWith({
      ownerId: "demo-friend-1",
      from: "2026-11-12",
      to: "2027-11-12",
    }),
  );
});

it("removes a blocked friend's cache even if the subsequent refresh fails", async () => {
  vi.mocked(blockFriend).mockResolvedValue({ blocked: true });
  render(<FriendsScreen />);
  await screen.findByText("수학 문제 5개 풀기");
  fireEvent.click(screen.getByRole("button", { name: "지민" }));
  await waitFor(() => expect(screen.getByRole("tab", { name: "기록" })).not.toBeDisabled());
  fireEvent.click(screen.getByRole("tab", { name: "기록" }));
  fireEvent.click(screen.getByLabelText("친구 관리"));
  fireEvent.click(screen.getByRole("button", { name: "차단" }));
  vi.mocked(getConnectionData).mockRejectedValue(new Error("refresh unavailable"));
  fireEvent.click(screen.getByRole("button", { name: "차단하기" }));
  await screen.findByText(/변경은 완료했지만/);
  expect(blockFriend).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByText("수학 문제 5개 풀기")).not.toBeInTheDocument();
});
it("drops prior account friend detail while a new account is loading", async () => {
  const view = render(<FriendsScreen />);
  await screen.findByText("수학 문제 5개 풀기");
  fireEvent.click(screen.getByRole("button", { name: "지민" }));
  await waitFor(() => expect(screen.getByRole("tab", { name: "기록" })).not.toBeDisabled());
  fireEvent.click(screen.getByRole("tab", { name: "기록" }));
  expect(screen.getByText("수학 문제 5개 풀기")).toBeVisible();
  vi.mocked(getConnectionData).mockImplementation(() => new Promise(() => {}));
  reviewAuth.id = "second-account";
  view.rerender(<FriendsScreen />);
  expect(screen.queryByText("수학 문제 5개 풀기")).not.toBeInTheDocument();
});
it("clears cached detail immediately on a realtime relationship change before refetch", async () => {
  render(<FriendsScreen />);
  await screen.findByText("수학 문제 5개 풀기");
  fireEvent.click(screen.getByRole("button", { name: "지민" }));
  await waitFor(() => expect(screen.getByRole("tab", { name: "기록" })).not.toBeDisabled());
  fireEvent.click(screen.getByRole("tab", { name: "기록" }));
  vi.mocked(getConnectionData).mockImplementation(() => new Promise(() => {}));
  act(() => realtime.listener?.("connection"));
  expect(screen.queryByText("수학 문제 5개 풀기")).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "지민" })).not.toBeInTheDocument();
});
it("drops signed-out data and never sends a late prior-account reaction", async () => {
  let resolve!: (value: Awaited<ReturnType<typeof listEncouragementSummaries>>) => void;
  vi.mocked(listEncouragementSummaries).mockImplementationOnce(
    () =>
      new Promise((yes) => {
        resolve = yes;
      }),
  );
  const view = render(<FriendsScreen />);
  fireEvent.click(await screen.findByRole("button", { name: "박수" }));
  reviewAuth.id = null;
  view.rerender(<FriendsScreen />);
  expect(screen.queryByText("수학 문제 5개 풀기")).not.toBeInTheDocument();
  await act(async () =>
    resolve({
      items: [{ occurrenceId: 101, summary: demoListSocial("demo-friend-1")[0].summary }],
    }),
  );
  expect(sendEncouragement).not.toHaveBeenCalled();
  expect(realtime.stop).toHaveBeenCalled();
});
it("ignores an old account's late feed response after the next account loads", async () => {
  let resolve!: (value: Awaited<ReturnType<typeof listSocialActivity>>) => void;
  vi.mocked(listSocialActivity).mockImplementationOnce(
    () =>
      new Promise((yes) => {
        resolve = yes;
      }),
  );
  const view = render(<FriendsScreen />);
  await waitFor(() => expect(listSocialActivity).toHaveBeenCalledTimes(1));
  vi.mocked(getConnectionData).mockResolvedValue({ friends: [], incoming: [], outgoing: [] });
  vi.mocked(listSocialActivity).mockResolvedValue({ items: [], nextCursor: null });
  reviewAuth.id = "second-account";
  view.rerender(<FriendsScreen />);
  await screen.findByText("친구를 추가하면 완료 소식을 볼 수 있어요");
  await act(async () => resolve({ items: demoListSocial("demo-friend-1"), nextCursor: null }));
  expect(screen.queryByText("수학 문제 5개 풀기")).not.toBeInTheDocument();
});
