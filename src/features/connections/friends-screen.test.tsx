import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { FriendsScreen } from "./friends-screen";
import {
  cancelConnectionRequest,
  disconnectFriend,
  respondToConnectionRequest,
  getConnectionData,
  listSocialActivity,
  type ConnectionChange,
} from "./connection-service";
import { getOccurrenceDetail, listOccurrenceWindow } from "@/features/tasks/task-service";
import {
  getEncouragementDay,
  saveDailyEncouragement,
} from "@/features/encouragements/daily-encouragement-service";
import {
  demoListSocial,
  demoGetConnections,
  demoGetDetail,
} from "@/features/tasks/demo-task-store";
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
  disconnectFriend: vi.fn(),
  respondToConnectionRequest: vi.fn(),
  cancelConnectionRequest: vi.fn(),
  sendConnectionRequest: vi.fn(),
}));
vi.mock("@/features/profile/profile-service", () => ({
  getProfileDetails: vi.fn().mockResolvedValue({ inviteCode: "CODE1234" }),
}));
vi.mock("@/features/tasks/task-service", () => ({
  getOccurrenceDetail: vi.fn(),
  listOccurrenceWindow: vi.fn().mockResolvedValue({ today: "2026-10-12", occurrences: [] }),
}));
vi.mock("@/features/encouragements/encouragement-service", async (original) => ({
  ...(await original<typeof import("@/features/encouragements/encouragement-service")>()),
  listEncouragementSummaries: vi.fn().mockResolvedValue({ items: [] }),
  saveDailyEncouragement: vi.fn(),
}));
vi.mock("@/features/encouragements/daily-encouragement-service", () => ({
  getEncouragementDay: vi.fn(),
  saveDailyEncouragement: vi.fn(),
  deleteDailyEncouragement: vi.fn(),
}));
vi.mock("@/features/notifications/inbox-read-receipt", () => ({ InboxReadReceipt: () => null }));
vi.mock("@/features/tasks/occurrence-detail-panel", () => ({
  OccurrenceDetailPanel: () => (
    <section role="dialog">
      <input aria-label="응원 초안" defaultValue="" />
    </section>
  ),
}));
beforeEach(() => {
  vi.clearAllMocks();
  reviewAuth.id = "demo";
  vi.mocked(getEncouragementDay).mockImplementation(async (id) => ({
    day: "2026-10-12",
    owner: { id, displayName: "지민", avatarKey: "lemon" },
    occurrences: id === "demo-friend-1" ? demoListSocial(id).map((item) => item.occurrence) : [],
    mine: null,
  }));
  vi.mocked(getOccurrenceDetail).mockImplementation(async ({ occurrenceId }) =>
    demoGetDetail(occurrenceId),
  );
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
it("keeps friend deletion inside management and cancellation preserves connection", async () => {
  render(<FriendsScreen />);
  await screen.findByText("수학 문제 5개 풀기");
  expect(screen.queryByRole("button", { name: "차단" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "친구 삭제" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "지민" }));
  await screen.findByLabelText("친구 관리");
  fireEvent.click(screen.getByLabelText("친구 관리"));
  fireEvent.click(screen.getByRole("button", { name: "친구 삭제" }));
  expect(screen.getByRole("button", { name: "취소" })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "취소" }));
  await waitFor(() => expect(screen.getByLabelText("친구 관리")).toHaveFocus());
  expect(disconnectFriend).not.toHaveBeenCalled();
  expect(screen.getByRole("heading", { name: "지민" })).toBeInTheDocument();
});
it("locks destructive submission and retains the friend on request failure", async () => {
  let reject!: (reason: Error) => void;
  vi.mocked(disconnectFriend).mockImplementation(
    () =>
      new Promise((_, no) => {
        reject = no;
      }),
  );
  render(<FriendsScreen />);
  await screen.findByText("수학 문제 5개 풀기");
  fireEvent.click(screen.getByRole("button", { name: "지민" }));
  fireEvent.click(await screen.findByLabelText("친구 관리"));
  fireEvent.click(screen.getByRole("button", { name: "친구 삭제" }));
  const confirm = screen.getByRole("button", { name: "친구 삭제하기" });
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  expect(disconnectFriend).toHaveBeenCalledTimes(1);
  await act(async () => reject(new Error("연결 실패")));
  await screen.findByText("연결 실패");
  expect(confirm).not.toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "취소" }));
  expect(screen.getByRole("heading", { name: "지민" })).toBeInTheDocument();
});
it("shows one daily composer for a friend even with several tasks", async () => {
  const occurrence = demoListSocial("demo-friend-1")[0].occurrence;
  vi.mocked(getEncouragementDay).mockResolvedValueOnce({
    day: "2026-10-12",
    owner: { id: "demo-friend-1", displayName: "지민", avatarKey: "lemon" },
    occurrences: [occurrence, { ...occurrence, id: 999, title_snapshot: "두 번째 할 일" }],
    mine: null,
  });
  render(<FriendsScreen />);
  await screen.findByText("두 번째 할 일");
  expect(screen.getAllByRole("button", { name: "응원 보내기" })).toHaveLength(1);
});
it("removes a successfully disconnected friend and their cached activity", async () => {
  vi.mocked(disconnectFriend).mockResolvedValue({ disconnected: true });
  render(<FriendsScreen />);
  await screen.findByText("수학 문제 5개 풀기");
  fireEvent.click(screen.getByRole("button", { name: "지민" }));
  fireEvent.click(await screen.findByLabelText("친구 관리"));
  fireEvent.click(screen.getByRole("button", { name: "친구 삭제" }));
  vi.mocked(getConnectionData).mockResolvedValue({ friends: [], incoming: [], outgoing: [] });
  fireEvent.click(screen.getByRole("button", { name: "친구 삭제하기" }));
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
it("opens a separate composer without sending a reaction", async () => {
  render(<FriendsScreen />);
  await screen.findByText("수학 문제 5개 풀기");
  expect(getOccurrenceDetail).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "박수" })).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole("button", { name: "응원 보내기" }));
  const input = await screen.findByRole("textbox", { name: "응원글" });
  expect(input).toBeVisible();
  await waitFor(() => expect(screen.getByRole("button", { name: "레몬" })).toHaveFocus());
  expect(screen.getByRole("dialog", { name: "응원 보내기" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "박수" }));
  expect(saveDailyEncouragement).not.toHaveBeenCalled();
});
it("confirms abandoning an inline draft before selecting a friend", async () => {
  render(<FriendsScreen />);
  fireEvent.click((await screen.findAllByRole("button", { name: "응원 보내기" }))[0]);
  fireEvent.change(await screen.findByRole("textbox", { name: "응원글" }), {
    target: { value: "keep me" },
  });
  fireEvent.click(screen.getByRole("button", { name: "지민" }));
  expect(screen.getByRole("dialog", { name: "작성 중인 응원을 버릴까요?" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "취소" })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "취소" }));
  expect(screen.getByRole("textbox", { name: "응원글" })).toHaveValue("keep me");
  fireEvent.click(screen.getByRole("button", { name: "지민" }));
  fireEvent.click(screen.getByRole("button", { name: "버리고 이동" }));
  await screen.findByRole("heading", { name: "지민" });
  expect(screen.queryByRole("textbox", { name: "응원글" })).not.toBeInTheDocument();
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
  expect(screen.getByRole("button", { name: "지민" })).toBeInTheDocument();
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

it("removes a disconnected friend's cache even if the subsequent refresh fails", async () => {
  vi.mocked(disconnectFriend).mockResolvedValue({ disconnected: true });
  render(<FriendsScreen />);
  await screen.findByText("수학 문제 5개 풀기");
  fireEvent.click(screen.getByRole("button", { name: "지민" }));
  await waitFor(() => expect(screen.getByRole("tab", { name: "기록" })).not.toBeDisabled());
  fireEvent.click(screen.getByRole("tab", { name: "기록" }));
  fireEvent.click(screen.getByLabelText("친구 관리"));
  fireEvent.click(screen.getByRole("button", { name: "친구 삭제" }));
  vi.mocked(getConnectionData).mockRejectedValue(new Error("refresh unavailable"));
  fireEvent.click(screen.getByRole("button", { name: "친구 삭제하기" }));
  await screen.findByText(/변경은 완료했지만/);
  expect(disconnectFriend).toHaveBeenCalledTimes(1);
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
  act(() => realtime.listener?.({ kind: "connection", change: "DELETE", connectionId: 71 }));
  expect(screen.queryByText("수학 문제 5개 풀기")).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "지민" })).not.toBeInTheDocument();
});
it("drops signed-out daily draft and never sends it", async () => {
  const view = render(<FriendsScreen />);
  fireEvent.click((await screen.findAllByRole("button", { name: "응원 보내기" }))[0]);
  fireEvent.change(screen.getByLabelText("응원글"), { target: { value: "unsent" } });
  reviewAuth.id = null;
  view.rerender(<FriendsScreen />);
  expect(screen.queryByLabelText("응원글")).not.toBeInTheDocument();
  expect(saveDailyEncouragement).not.toHaveBeenCalled();
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
  await screen.findByText("친구를 추가하고 서로의 하루를 응원해 보세요");
  await act(async () => resolve({ items: demoListSocial("demo-friend-1"), nextCursor: null }));
  expect(screen.queryByText("수학 문제 5개 풀기")).not.toBeInTheDocument();
});

it("keeps a current friend's draft when another friendship is added", async () => {
  render(<FriendsScreen />);
  fireEvent.click((await screen.findAllByRole("button", { name: "응원 보내기" }))[0]);
  fireEvent.change(await screen.findByRole("textbox", { name: "응원글" }), {
    target: { value: "아직 작성 중" },
  });
  vi.mocked(getConnectionData).mockResolvedValue({
    friends: [
      { id: "demo-friend-1", displayName: "지민", avatarKey: "lemon" },
      { id: "new-friend", displayName: "새 친구", avatarKey: "lemon" },
    ],
    incoming: [],
    outgoing: [],
  });
  await act(async () =>
    realtime.listener?.({
      kind: "connection",
      change: "INSERT",
      friendId: "new-friend",
      connectionId: 72,
    }),
  );
  expect(screen.queryByRole("textbox", { name: "응원글" })).toHaveValue("아직 작성 중");
});
it.each(["INSERT", "UPDATE", "DELETE"] as const)(
  "keeps the draft across an unrelated request %s",
  async (change) => {
    render(<FriendsScreen />);
    fireEvent.click((await screen.findAllByRole("button", { name: "응원 보내기" }))[0]);
    fireEvent.change(await screen.findByLabelText("응원글"), {
      target: { value: "keep this draft" },
    });
    await act(async () => realtime.listener?.({ kind: "request", change }));
    expect(await screen.findByLabelText("응원글")).toHaveValue("keep this draft");
  },
);
it("discards only the current friend's draft after its exact connection deletion", async () => {
  render(<FriendsScreen />);
  fireEvent.click((await screen.findAllByRole("button", { name: "응원 보내기" }))[0]);
  fireEvent.change(await screen.findByLabelText("응원글"), { target: { value: "must disappear" } });
  vi.mocked(getConnectionData).mockImplementation(() => new Promise(() => {}));
  act(() => realtime.listener?.({ kind: "connection", change: "DELETE", connectionId: 71 }));
  expect(screen.queryByLabelText("응원글")).not.toBeInTheDocument();
});
it("keeps a current draft when a different friend's connection is deleted", async () => {
  vi.mocked(getConnectionData).mockResolvedValue({
    friends: [
      { id: "demo-friend-1", connectionId: 71, displayName: "지민", avatarKey: "lemon" },
      { id: "another-friend", connectionId: 72, displayName: "다른 친구", avatarKey: "lemon" },
    ],
    incoming: [],
    outgoing: [],
  });
  render(<FriendsScreen />);
  fireEvent.click((await screen.findAllByRole("button", { name: "응원 보내기" }))[0]);
  fireEvent.change(await screen.findByLabelText("응원글"), {
    target: { value: "still connected" },
  });
  vi.mocked(getConnectionData).mockResolvedValue({
    friends: [{ id: "demo-friend-1", connectionId: 71, displayName: "지민", avatarKey: "lemon" }],
    incoming: [],
    outgoing: [],
  });
  await act(async () =>
    realtime.listener?.({ kind: "connection", change: "DELETE", connectionId: 72 }),
  );
  expect(await screen.findByLabelText("응원글")).toHaveValue("still connected");
});

it("moves focus to the request heading after accepting removes the request row", async () => {
  const data = demoGetConnections();
  vi.mocked(getConnectionData)
    .mockResolvedValueOnce(data)
    .mockResolvedValue({ ...data, incoming: [] });
  vi.mocked(respondToConnectionRequest).mockResolvedValue({ requestId: 41, status: "accepted" });
  render(<FriendsScreen />);
  await screen.findByText("수학 문제 5개 풀기");
  fireEvent.click(screen.getByRole("button", { name: /받은 요청.*확인하기/ }));
  fireEvent.click(await screen.findByRole("button", { name: "수락" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "받은 요청 0" })).toHaveFocus());
  fireEvent.click(screen.getByRole("button", { name: "닫기" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "친구 추가" })).toHaveFocus());
});

it("guards links and browser back with the app dialog and preserved route state", async () => {
  window.history.pushState({ __NA: true, tree: "home" }, "", "/");
  window.history.pushState({ __NA: true, tree: "kept" }, "", "/friends/");
  render(<FriendsScreen />);
  fireEvent.click((await screen.findAllByRole("button", { name: "응원 보내기" }))[0]);
  const draft = await screen.findByLabelText("응원글");
  fireEvent.change(draft, { target: { value: "unsent" } });
  expect(window.history.state).toMatchObject({ __NA: true, tree: "kept", lemonFriendDraft: true });
  const link = document.createElement("a");
  link.href = "/profile/";
  document.body.append(link);
  link.focus();
  expect(fireEvent.click(link)).toBe(false);
  expect(screen.getByRole("button", { name: "취소" })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "취소" }));
  expect(link).toHaveFocus();
  expect(draft).toHaveValue("unsent");
  act(() => window.history.back());
  await screen.findByRole("dialog", { name: "작성 중인 응원을 버릴까요?" });
  expect(window.history.state).toEqual({ __NA: true, tree: "kept", lemonFriendDraft: true });
  expect(screen.getByRole("button", { name: "취소" })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "취소" }));
  expect(window.location.pathname).toBe("/friends/");
  expect(draft).toHaveValue("unsent");
  act(() => window.history.back());
  fireEvent.click(await screen.findByRole("button", { name: "버리고 이동" }));
  await waitFor(() => expect(window.location.pathname).toBe("/"));
  link.remove();
});

it("continues the exact blocked link once after app confirmation", async () => {
  render(<FriendsScreen />);
  fireEvent.click((await screen.findAllByRole("button", { name: "응원 보내기" }))[0]);
  fireEvent.change(await screen.findByLabelText("응원글"), { target: { value: "unsent" } });
  const link = document.createElement("a");
  link.href = "/profile/?section=settings";
  const navigate = vi.fn((event: MouseEvent) => event.preventDefault());
  link.addEventListener("click", navigate);
  document.body.append(link);
  fireEvent.click(link);
  expect(navigate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "버리고 이동" }));
  await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
  expect(link.getAttribute("href")).toBe("/profile/?section=settings");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  link.remove();
});

it("keeps multiple inline drafts across a failed unrelated feed refresh", async () => {
  vi.mocked(getConnectionData).mockResolvedValue({
    friends: demoGetConnections().friends,
    incoming: [],
    outgoing: [],
  });
  render(<FriendsScreen />);
  await screen.findByText("수학 문제 5개 풀기");
  const compose = screen.getAllByRole("button", { name: "응원 보내기" });
  fireEvent.click(compose[0]);
  fireEvent.change(await screen.findByLabelText("응원글"), { target: { value: "첫 번째 초안" } });
  fireEvent.click(compose[1]);
  await waitFor(() => expect(screen.getAllByLabelText("응원글")).toHaveLength(2));
  fireEvent.change(screen.getAllByLabelText("응원글")[1], { target: { value: "두 번째 초안" } });
  vi.mocked(listSocialActivity).mockRejectedValue(new Error("feed unavailable"));
  await act(async () =>
    realtime.listener?.({ kind: "connection", change: "INSERT", friendId: "other" }),
  );
  await screen.findByText("feed unavailable");
  expect(screen.getAllByLabelText("응원글")[0]).toHaveValue("첫 번째 초안");
  expect(screen.getAllByLabelText("응원글")[1]).toHaveValue("두 번째 초안");
});

it("blocks target changes during inline submission", async () => {
  vi.mocked(saveDailyEncouragement).mockImplementationOnce(() => new Promise(() => {}));
  render(<FriendsScreen />);
  fireEvent.click((await screen.findAllByRole("button", { name: "응원 보내기" }))[0]);
  fireEvent.change(await screen.findByLabelText("응원글"), { target: { value: "saving" } });
  fireEvent.click(screen.getByRole("button", { name: "박수" }));
  fireEvent.click(
    within(screen.getByRole("dialog", { name: "응원 보내기" })).getByRole("button", {
      name: "응원 보내기",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "지민" }));
  expect(screen.getByRole("dialog", { name: "응원 보내기" })).toBeVisible();
  expect(screen.queryByRole("heading", { name: "지민" })).not.toBeInTheDocument();
  expect(screen.getByLabelText("응원글")).toHaveValue("saving");
});

it("shows additional friends without hiding previously loaded choices", async () => {
  vi.mocked(getConnectionData).mockResolvedValue({
    friends: Array.from({ length: 19 }, (_, index) => ({
      id: `friend-${index}`,
      displayName: `친구 ${index}`,
      avatarKey: "lemon",
    })),
    incoming: [],
    outgoing: [],
  });
  render(<FriendsScreen />);
  fireEvent.click(await screen.findByRole("button", { name: "친구 더 보기" }));
  expect(screen.getByRole("button", { name: "친구 0" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "친구 15" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "친구 18" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "친구 더 보기" }));
  expect(screen.getByRole("button", { name: "친구 18" })).toBeInTheDocument();
});

it("retains a rejected request on failure and removes it after confirmed success", async () => {
  const data = demoGetConnections();
  vi.mocked(getConnectionData).mockResolvedValue(data);
  vi.mocked(respondToConnectionRequest).mockRejectedValueOnce(new Error("요청 처리 실패"));
  render(<FriendsScreen />);
  fireEvent.click(await screen.findByRole("button", { name: /받은 요청.*확인하기/ }));
  fireEvent.click(screen.getByRole("button", { name: "거절" }));
  await screen.findByText("요청 처리 실패");
  expect(screen.getByRole("button", { name: "수락" })).toBeEnabled();
  vi.mocked(respondToConnectionRequest).mockResolvedValueOnce({
    requestId: data.incoming[0].id,
    status: "rejected",
  });
  vi.mocked(getConnectionData).mockResolvedValue({ ...data, incoming: [] });
  fireEvent.click(screen.getByRole("button", { name: "거절" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "받은 요청 0" })).toHaveFocus());
  expect(respondToConnectionRequest).toHaveBeenLastCalledWith(data.incoming[0].id, false);
});

it("cancels outgoing requests and returns focus to the remaining list", async () => {
  const data = demoGetConnections();
  vi.mocked(getConnectionData).mockResolvedValue(data);
  vi.mocked(cancelConnectionRequest).mockResolvedValue({
    requestId: data.outgoing[0].id,
    status: "cancelled",
  });
  render(<FriendsScreen />);
  fireEvent.click(await screen.findByRole("button", { name: /받은 요청.*확인하기/ }));
  vi.mocked(getConnectionData).mockResolvedValue({ ...data, outgoing: [] });
  fireEvent.click(screen.getByRole("button", { name: "요청 취소" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "보낸 요청 0" })).toHaveFocus());
  expect(cancelConnectionRequest).toHaveBeenCalledWith(data.outgoing[0].id);
});

it("restores the draft after cancelling detail navigation and opens detail only after approval", async () => {
  render(<FriendsScreen />);
  fireEvent.click((await screen.findAllByRole("button", { name: "응원 보내기" }))[0]);
  fireEvent.change(await screen.findByLabelText("응원글"), {
    target: { value: "keep detail draft" },
  });
  const trigger = screen.getByRole("button", { name: /수학 문제 5개 풀기/ });
  trigger.focus();
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole("button", { name: "취소" }));
  expect(trigger).toHaveFocus();
  expect(screen.getByLabelText("응원글")).toHaveValue("keep detail draft");
  expect(screen.queryByLabelText("응원 초안")).not.toBeInTheDocument();
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole("button", { name: "버리고 이동" }));
  await screen.findByLabelText("응원 초안");
  expect(screen.queryByLabelText("응원글")).not.toBeInTheDocument();
});

it("guards tab and feed return with the same cancel-first dialog", async () => {
  render(<FriendsScreen />);
  fireEvent.click(await screen.findByRole("button", { name: "지민" }));
  await waitFor(() => expect(screen.getByRole("tab", { name: "기록" })).toBeEnabled());
  fireEvent.click(await screen.findByRole("button", { name: "응원 보내기" }));
  fireEvent.change(await screen.findByLabelText("응원글"), { target: { value: "history draft" } });
  fireEvent.click(screen.getByRole("tab", { name: "기록" }));
  expect(screen.getByRole("button", { name: "취소" })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "취소" }));
  expect(screen.getByRole("tab", { name: "오늘" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByLabelText("응원글")).toHaveValue("history draft");
  fireEvent.click(screen.getByRole("button", { name: "친구 목록으로" }));
  fireEvent.click(screen.getByRole("button", { name: "버리고 이동" }));
  await screen.findByRole("button", { name: "지민" });
  expect(screen.queryByLabelText("응원글")).not.toBeInTheDocument();
});

it("dismisses a pending discard decision immediately when server access is lost", async () => {
  render(<FriendsScreen />);
  fireEvent.click((await screen.findAllByRole("button", { name: "응원 보내기" }))[0]);
  fireEvent.change(await screen.findByLabelText("응원글"), { target: { value: "revoked" } });
  fireEvent.click(screen.getByRole("button", { name: "지민" }));
  expect(screen.getByRole("dialog", { name: "작성 중인 응원을 버릴까요?" })).toBeInTheDocument();
  vi.mocked(getConnectionData).mockImplementation(() => new Promise(() => {}));
  act(() => realtime.listener?.({ kind: "connection", change: "DELETE", connectionId: 71 }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("응원글")).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "지민" })).not.toBeInTheDocument();
});

it("retires draft history before SPA departure so repeated reentry keeps one back step", async () => {
  window.history.pushState({ __NA: true, tree: "home" }, "", "/");
  window.history.pushState({ __NA: true, tree: "friends" }, "", "/friends/");
  for (let cycle = 0; cycle < 2; cycle++) {
    const view = render(<FriendsScreen />);
    fireEvent.click((await screen.findAllByRole("button", { name: "응원 보내기" }))[0]);
    fireEvent.change(await screen.findByLabelText("응원글"), {
      target: { value: `draft ${cycle}` },
    });
    const link = document.createElement("a");
    link.href = "/profile/";
    link.addEventListener("click", (event) => {
      event.preventDefault();
      window.history.pushState({ __NA: true, tree: "profile" }, "", "/profile/");
    });
    document.body.append(link);
    fireEvent.click(link);
    fireEvent.click(screen.getByRole("button", { name: "버리고 이동" }));
    await waitFor(() => expect(window.location.pathname).toBe("/profile/"));
    view.unmount();
    link.remove();
    act(() => window.history.back());
    await waitFor(() => expect(window.location.pathname).toBe("/friends/"));
    expect(window.history.state).toEqual({ __NA: true, tree: "friends" });
  }
  render(<FriendsScreen />);
  fireEvent.click((await screen.findAllByRole("button", { name: "응원 보내기" }))[0]);
  fireEvent.change(await screen.findByLabelText("응원글"), { target: { value: "third draft" } });
  act(() => window.history.back());
  fireEvent.click(await screen.findByRole("button", { name: "취소" }));
  expect(screen.getByLabelText("응원글")).toHaveValue("third draft");
  expect(window.location.pathname).toBe("/friends/");
  act(() => window.history.back());
  fireEvent.click(await screen.findByRole("button", { name: "버리고 이동" }));
  await waitFor(() => expect(window.location.pathname).toBe("/"));
});

it("adopts a retained friend history marker rather than adding another on reentry", async () => {
  window.history.pushState({ __NA: true, tree: "home" }, "", "/");
  window.history.pushState({ __NA: true, tree: "friends" }, "", "/friends/");
  window.history.pushState(
    { __NA: true, tree: "friends", lemonFriendDraft: true },
    "",
    "/friends/",
  );
  const length = window.history.length;
  render(<FriendsScreen />);
  fireEvent.click((await screen.findAllByRole("button", { name: "응원 보내기" }))[0]);
  fireEvent.change(await screen.findByLabelText("응원글"), { target: { value: "new draft" } });
  expect(window.history.length).toBe(length);
  act(() => window.history.back());
  fireEvent.click(await screen.findByRole("button", { name: "버리고 이동" }));
  await waitFor(() => expect(window.location.pathname).toBe("/"));
});

it.each(["back", "link"])(
  "leaves a saved draft without a dialog or extra history entry via %s",
  async (mode) => {
    window.history.pushState({ __NA: true, tree: "home" }, "", "/");
    window.history.pushState({ __NA: true, tree: "friends" }, "", "/friends/");
    vi.mocked(saveDailyEncouragement).mockResolvedValueOnce({
      id: 90,
      ownerId: "demo-friend-1",
      authorId: "demo",
      day: "2026-10-12",
      reaction: "clap",
      message: "saved",
      quote: null,
      authorName: "나",
      authorAvatarKey: "lemon",
      createdAt: new Date().toISOString(),
    });
    const view = render(<FriendsScreen />);
    fireEvent.click((await screen.findAllByRole("button", { name: "응원 보내기" }))[0]);
    fireEvent.change(await screen.findByLabelText("응원글"), { target: { value: "saved" } });
    fireEvent.click(screen.getByRole("button", { name: "박수" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "응원 보내기" })).getByRole("button", {
        name: "응원 보내기",
      }),
    );
    await screen.findByRole("button", { name: "수정" });
    if (mode === "back") {
      act(() => window.history.back());
      await waitFor(() => expect(window.location.pathname).toBe("/"));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      return;
    }
    const link = document.createElement("a");
    link.href = "/profile/";
    link.addEventListener("click", (event) => {
      event.preventDefault();
      window.history.pushState({ __NA: true, tree: "profile" }, "", "/profile/");
    });
    document.body.append(link);
    fireEvent.click(link);
    await waitFor(() => expect(window.location.pathname).toBe("/profile/"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    view.unmount();
    link.remove();
    act(() => window.history.back());
    await waitFor(() => expect(window.location.pathname).toBe("/friends/"));
    expect(window.history.state).toEqual({ __NA: true, tree: "friends" });
    act(() => window.history.back());
    await waitFor(() => expect(window.location.pathname).toBe("/"));
  },
);
