import { afterEach, expect, it, vi } from "vitest";
import { getSupabaseClient } from "@/lib/supabase/client";
import { listOwnHistory, getOccurrenceDetail } from "./task-service";
import { listSocialActivity } from "@/features/connections/connection-service";
import { listEncouragementSummaries } from "@/features/encouragements/encouragement-service";
import {
  listInbox,
  getInboxUnreadCount,
  markAllInboxRead,
} from "@/features/notifications/notification-service";
vi.mock("@/lib/supabase/client", () => ({ getSupabaseClient: vi.fn() }));
afterEach(() => vi.clearAllMocks());
function mockRpc(data: unknown = { items: [], nextCursor: null }, message?: string) {
  const rpc = vi.fn().mockResolvedValue({ data, error: message ? { message } : null });
  vi.mocked(getSupabaseClient).mockReturnValue({ rpc } as unknown as ReturnType<
    typeof getSupabaseClient
  >);
  return rpc;
}
it("passes a stable first-completion cursor without a date cutoff", async () => {
  const rpc = mockRpc();
  await listOwnHistory({
    cursor: { firstCompletedAt: "2020-01-01T00:00:00Z", occurrenceId: 23 },
    limit: 30,
  });
  expect(rpc).toHaveBeenCalledWith("list_own_history", {
    cursor_completed_at: "2020-01-01T00:00:00Z",
    cursor_occurrence_id: 23,
    page_limit: 30,
  });
});
it("validates cursors, ids and limits before contacting the server", async () => {
  const rpc = mockRpc();
  await expect(listSocialActivity({ friendId: "bad" })).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  await expect(listOwnHistory({ limit: 101 })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(getOccurrenceDetail({ occurrenceId: -1 })).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  await expect(markAllInboxRead({ throughId: 0 })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(rpc).not.toHaveBeenCalled();
});
it("keeps forbidden summaries absent rather than inventing zero counts", async () => {
  mockRpc({ items: [] });
  expect(await listEncouragementSummaries({ occurrenceIds: [1, 2] })).toEqual({ items: [] });
});
it.each(["UNAUTHENTICATED", "FORBIDDEN", "NOT_FOUND"])(
  "preserves server %s errors",
  async (code) => {
    mockRpc(null, code);
    await expect(getOccurrenceDetail({ occurrenceId: 1 })).rejects.toMatchObject({ code });
  },
);
it("uses direct inbox projections and limits mark-all to an observed high-water id", async () => {
  const rpc = mockRpc();
  await listInbox({ filter: "encouragement", cursor: 55 });
  expect(rpc).toHaveBeenLastCalledWith("list_inbox", {
    inbox_filter: "encouragement",
    cursor_id: 55,
    page_limit: 50,
  });
  rpc.mockResolvedValueOnce({ data: { unreadCount: 2 }, error: null });
  expect(await getInboxUnreadCount()).toEqual({ unreadCount: 2 });
  rpc.mockResolvedValueOnce({
    data: { updatedCount: 2, readAt: "2026-10-12T00:00:00Z" },
    error: null,
  });
  await markAllInboxRead({ throughId: 55 });
  expect(rpc).toHaveBeenLastCalledWith("mark_all_inbox_read", { through_id: 55 });
});
it("rejects malformed server output instead of presenting a successful empty page", async () => {
  mockRpc(null);
  await expect(listOwnHistory({})).rejects.toMatchObject({ code: "INVALID_INPUT" });
});
