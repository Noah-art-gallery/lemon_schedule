import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { FriendTimeline } from "./friend-timeline";
import { listFriendTimeline, type TimelineItem, type TimelinePage } from "./timeline-service";
import { AppError } from "@/lib/errors";
vi.mock("./timeline-service", async (original) => ({
  ...(await original<typeof import("./timeline-service")>()),
  listFriendTimeline: vi.fn(),
}));
vi.mock("@/features/encouragements/daily-friend-card", () => ({ DailyFriendCard: () => null }));
const friend = {
  id: "00000000-0000-0000-0000-000000000302",
  displayName: "지민",
  avatarKey: "cat" as const,
  connectionId: 1,
};
const props = {
  friends: [friend],
  demo: false,
  onOpenFriend: vi.fn(),
  onOpenOccurrence: vi.fn(),
  onDirtyChange: vi.fn(),
  onBusyChange: vi.fn(),
};
const item: TimelineItem = {
  kind: "created",
  eventId: 1,
  occurredAt: "2026-10-24T08:00:00Z",
  owner: friend,
  ownerDay: "2026-10-24",
  cheeredToday: false,
  task: { id: 1, title: "산책", dueDate: "2026-10-24" },
  occurrenceId: null,
};
const page: TimelinePage = { items: [item], nextCursor: null, viewerTimeZone: "Asia/Seoul" };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listFriendTimeline).mockResolvedValue(page);
});
it("removes disconnected owners immediately and ignores their pending response", async () => {
  let resolve!: (value: TimelinePage) => void;
  vi.mocked(listFriendTimeline).mockReturnValueOnce(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const view = render(<FriendTimeline {...props} />);
  await waitFor(() => expect(listFriendTimeline).toHaveBeenCalledTimes(1));
  vi.mocked(listFriendTimeline).mockResolvedValue({ ...page, items: [] });
  view.rerender(<FriendTimeline {...props} friends={[]} />);
  await act(async () => resolve(page));
  await screen.findByText("아직 친구 활동이 없어요");
  expect(screen.queryByText("산책")).not.toBeInTheDocument();
});
it("keeps loaded rows on pagination failure and retries without duplicates", async () => {
  const cursor = { occurredAt: item.occurredAt, kind: item.kind, eventId: item.eventId };
  vi.mocked(listFriendTimeline)
    .mockResolvedValueOnce({ ...page, nextCursor: cursor })
    .mockRejectedValueOnce(new AppError("INVALID_INPUT", "연결 실패"));
  render(<FriendTimeline {...props} />);
  fireEvent.click(await screen.findByRole("button", { name: "이전 활동 더 보기" }));
  await screen.findByRole("alert");
  expect(screen.getByText("산책")).toBeInTheDocument();
  vi.mocked(listFriendTimeline).mockResolvedValueOnce({
    ...page,
    items: [item, { ...item, eventId: 2, task: { ...item.task, id: 2, title: "독서" } }],
  });
  fireEvent.click(screen.getByRole("button", { name: "이전 활동 다시 불러오기" }));
  await screen.findByText("독서");
  expect(screen.getAllByRole("article")).toHaveLength(2);
  expect(listFriendTimeline).toHaveBeenLastCalledWith({ friendId: undefined, cursor });
});
it("shows an access failure separately from an empty feed", async () => {
  vi.mocked(listFriendTimeline).mockRejectedValueOnce(
    new AppError("FORBIDDEN", "접근할 수 없어요"),
  );
  render(<FriendTimeline {...props} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("접근할 수 없어요");
  expect(screen.queryByText("아직 친구 활동이 없어요")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  await screen.findByText("산책");
});
it("replaces a filtered feed instead of mixing pages from another scope", async () => {
  render(<FriendTimeline {...props} />);
  await screen.findByText("산책");
  vi.mocked(listFriendTimeline).mockResolvedValue({ ...page, items: [] });
  fireEvent.click(screen.getByRole("button", { name: "지민" }));
  expect(screen.queryByText("산책")).not.toBeInTheDocument();
  await screen.findByText("아직 친구 활동이 없어요");
  expect(listFriendTimeline).toHaveBeenLastCalledWith({ friendId: friend.id, cursor: undefined });
});
