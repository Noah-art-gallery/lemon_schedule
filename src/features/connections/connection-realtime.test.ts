import { expect, it, vi } from "vitest";
import { getSupabaseClient } from "@/lib/supabase/client";
import { subscribeConnectionChanges } from "./connection-service";
vi.mock("@/lib/supabase/client", () => ({ getSupabaseClient: vi.fn() }));
it("identifies a DELETE by its primary key and stops callbacks after cleanup", () => {
  const handlers = new Map<
    string,
    (payload: { eventType: string; old: object; new: object }) => void
  >();
  const channel = {
    on: vi.fn(
      (
        _event: string,
        filter: { table: string },
        callback: (payload: { eventType: string; old: object; new: object }) => void,
      ) => {
        handlers.set(filter.table, callback);
        return channel;
      },
    ),
    subscribe: vi.fn(() => channel),
  };
  const removeChannel = vi.fn();
  vi.mocked(getSupabaseClient).mockReturnValue({
    channel: () => channel,
    removeChannel,
  } as unknown as ReturnType<typeof getSupabaseClient>);
  const listener = vi.fn();
  const stop = subscribeConnectionChanges("me", listener);
  handlers.get("connections")!({ eventType: "DELETE", old: { id: 71 }, new: {} });
  expect(listener).toHaveBeenLastCalledWith({
    kind: "connection",
    change: "DELETE",
    connectionId: 71,
    friendId: undefined,
  });
  handlers.get("connections")!({
    eventType: "INSERT",
    old: {},
    new: { id: 72, user_low_id: "me", user_high_id: "new-friend" },
  });
  expect(listener).toHaveBeenLastCalledWith({
    kind: "connection",
    change: "INSERT",
    connectionId: 72,
    friendId: "new-friend",
  });
  stop();
  handlers.get("connection_requests")!({ eventType: "INSERT", old: {}, new: {} });
  expect(listener).toHaveBeenCalledTimes(2);
  expect(removeChannel).toHaveBeenCalledWith(channel);
});
