import { beforeEach, expect, it, vi } from "vitest";
import { listFriendTimeline } from "./timeline-service";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/client", () => ({ getSupabaseClient: () => ({ rpc }) }));
const owner = { id: "00000000-0000-4000-8000-000000000301", displayName: "친구", avatarKey: "cat" };
const item = {
  kind: "completed",
  eventId: 1,
  occurredAt: "2026-10-24T08:00:00.123456+00:00",
  owner,
  ownerDay: "2026-10-24",
  cheeredToday: false,
  task: { id: 1, title: "산책", dueDate: "2026-10-24" },
  occurrenceId: 1,
};
beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({
    data: { items: [item], nextCursor: null, viewerTimeZone: "Asia/Seoul" },
    error: null,
  });
});
it("preserves timestamp precision and event kind in pagination", async () => {
  const cursor = { occurredAt: item.occurredAt, kind: "completed" as const, eventId: 1 };
  expect(
    (await listFriendTimeline({ friendId: owner.id, cursor, limit: 2 })).items[0].occurredAt,
  ).toBe(item.occurredAt);
  expect(rpc).toHaveBeenCalledWith("list_friend_timeline", {
    target_friend_id: owner.id,
    cursor_occurred_at: cursor.occurredAt,
    cursor_kind: "completed",
    cursor_event_id: 1,
    page_limit: 2,
  });
});
it.each([0, 101, -1, 1.5])("rejects invalid page size %s before RPC", async (limit) => {
  await expect(listFriendTimeline({ limit })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(rpc).not.toHaveBeenCalled();
});
it.each(["FORBIDDEN", "UNAUTHENTICATED"])("retains %s access errors", async (code) => {
  rpc.mockResolvedValue({ data: null, error: { message: code } });
  await expect(listFriendTimeline()).rejects.toMatchObject({ code });
});
it.each([
  { ...item, occurrenceId: null },
  { ...item, kind: "created" },
])("rejects inconsistent event payloads", async (invalid) => {
  rpc.mockResolvedValue({
    data: { items: [invalid], nextCursor: null, viewerTimeZone: "UTC" },
    error: null,
  });
  await expect(listFriendTimeline()).rejects.toMatchObject({ code: "INVALID_INPUT" });
});
it("does not fabricate a successful empty feed when the migration is unavailable", async () => {
  rpc.mockResolvedValue({
    data: null,
    error: { message: "Could not find public.list_friend_timeline" },
  });
  await expect(listFriendTimeline()).rejects.toMatchObject({ code: "INVALID_INPUT" });
});
