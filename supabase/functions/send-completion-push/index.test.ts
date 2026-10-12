import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";

let handler: (request: Request) => Promise<Response>;
const secret = "this-is-a-local-test-secret-at-least-32-characters";
const { from, createClient } = vi.hoisted(() => ({ from: vi.fn(), createClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient }));
type Row = Record<string, unknown>;
let rows: Record<string, Row[]>;
let queryError: string | undefined;
let duplicate = false;
let writes: Row[];

beforeAll(async () => {
  vi.stubGlobal("crypto", {
    subtle: {
      importKey: vi.fn().mockResolvedValue({}),
      sign: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    },
  });
  vi.stubGlobal("Deno", {
    env: {
      get: (name: string) =>
        ({
          PUSH_WEBHOOK_SECRET: secret,
          SUPABASE_URL: "https://local.test",
          SUPABASE_SERVICE_ROLE_KEY: "test-only",
          FCM_CLIENT_EMAIL: "local@test.invalid",
          FCM_PRIVATE_KEY: "AA==",
          FCM_PROJECT_ID: "test-project",
        })[name],
    },
    serve: (next: typeof handler) => {
      handler = next;
    },
  });
  await import("./index");
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => vi.restoreAllMocks());
beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("provider unavailable"));
  queryError = undefined;
  duplicate = false;
  writes = [];
  rows = {
    notifications: [
      {
        id: 1,
        recipient_id: "owner",
        actor_id: "friend",
        occurrence_id: 2,
        encouragement_id: 3,
        connection_request_id: 4,
        notification_type: "encouragement_received",
      },
    ],
    connections: [{ user_low_id: "friend", user_high_id: "owner" }],
    task_occurrences: [{ id: 2, task_id: 5, owner_id: "owner", status: "completed" }],
    tasks: [{ id: 5, deleted_at: null }],
    encouragements: [
      { id: 3, occurrence_id: 2, author_id: "friend", owner_id: "owner", visibility: "visible" },
    ],
    connection_requests: [
      { id: 4, requester_id: "friend", addressee_id: "owner", status: "pending" },
    ],
    device_tokens: [],
    push_delivery_attempts: [],
  };
  from.mockReset().mockImplementation((table: string) => {
    let result = [...(rows[table] ?? [])];
    let error: { code: string } | null = queryError === table ? { code: "QUERY_FAILED" } : null;
    const builder = {
      select: () => builder,
      eq: (key: string, value: unknown) => {
        result = result.filter((row) => row[key] === value);
        return builder;
      },
      is: (key: string, value: unknown) => {
        result = result.filter((row) => row[key] === value);
        return builder;
      },
      in: (key: string, values: unknown[]) => {
        result = result.filter((row) => values.includes(row[key]));
        return builder;
      },
      insert: (value: Row) => {
        writes.push(value);
        result = [{ id: 9 }];
        if (duplicate) error = { code: "23505" };
        return builder;
      },
      update: (value: Row) => {
        writes.push(value);
        return builder;
      },
      maybeSingle: async () => ({ data: result[0] ?? null, error }),
      single: async () => ({ data: result[0] ?? null, error }),
      then: (resolve: (value: unknown) => void) => resolve({ data: result, error }),
    };
    return builder;
  });
  createClient.mockReset().mockReturnValue({ from });
});

function request(
  event: unknown = { type: "INSERT", table: "notifications", record: { id: 1 } },
  header = secret,
) {
  return handler(
    new Request("https://example.test/push", {
      method: "POST",
      headers: { "x-lemon-webhook-secret": header },
      body: JSON.stringify(event),
    }),
  );
}
async function result() {
  return (await request()).json();
}
function noDevicesRead() {
  expect(from).not.toHaveBeenCalledWith("device_tokens");
}

it("rejects missing or incorrect webhook secret before project data", async () => {
  expect((await request(undefined, "")).status).toBe(401);
  expect((await request(undefined, secret + "x")).status).toBe(401);
  expect(createClient).not.toHaveBeenCalled();
});
it("rejects non-insert and malformed events", async () => {
  expect(
    (await request({ type: "UPDATE", table: "notifications", record: { id: 1 } })).status,
  ).toBe(400);
  expect(
    (await request({ type: "INSERT", table: "notifications", record: { id: -1 } })).status,
  ).toBe(400);
  expect(createClient).not.toHaveBeenCalled();
});
it("skips completion notifications before reading relationships or devices", async () => {
  rows.notifications[0].notification_type = "task_completed";
  expect(await result()).toEqual({ skipped: "DIRECT_NOTIFICATION_ONLY" });
  noDevicesRead();
});
it("resolves a visible received encouragement against server data", async () => {
  expect(await result()).toEqual({ sent: 0, failed: 0, skipped: 0 });
  expect(from).toHaveBeenCalledWith("encouragements");
});
it.each(["hidden_by_owner", "deleted_by_author"])(
  "does not send %s encouragements",
  async (visibility) => {
    rows.encouragements[0].visibility = visibility;
    expect(await result()).toEqual({ skipped: "ENCOURAGEMENT_UNAVAILABLE" });
    noDevicesRead();
  },
);
it.each(["author_id", "owner_id", "occurrence_id"])(
  "rejects mismatched encouragement %s",
  async (key) => {
    rows.encouragements[0][key] = "other";
    expect(await result()).toEqual({ skipped: "ENCOURAGEMENT_UNAVAILABLE" });
    noDevicesRead();
  },
);
it("skips reopened and deleted tasks", async () => {
  rows.task_occurrences[0].status = "pending";
  expect(await result()).toEqual({ skipped: "NOT_COMPLETED" });
  noDevicesRead();
  rows.task_occurrences[0].status = "completed";
  rows.tasks[0].deleted_at = "2026-10-12";
  expect(await result()).toEqual({ skipped: "TASK_DELETED" });
  noDevicesRead();
});
it("skips revoked relationships before token access", async () => {
  rows.connections = [];
  expect(await result()).toEqual({ skipped: "NOT_CONNECTED" });
  noDevicesRead();
});
it("delivers direct notifications without the retired blocks table", async () => {
  queryError = "blocks";
  expect(await result()).toEqual({ sent: 0, failed: 0, skipped: 0 });
  expect(from).not.toHaveBeenCalledWith("blocks");
});
it("sends pending incoming requests without requiring a connection", async () => {
  rows.notifications[0].notification_type = "connection_request";
  rows.connections = [];
  expect(await result()).toEqual({ sent: 0, failed: 0, skipped: 0 });
});
it.each(["accepted", "rejected", "cancelled"])("skips %s requests", async (status) => {
  rows.notifications[0].notification_type = "connection_request";
  rows.connection_requests[0].status = status;
  expect(await result()).toEqual({ skipped: "REQUEST_UNAVAILABLE" });
  noDevicesRead();
});
it("checks request parties", async () => {
  rows.notifications[0].notification_type = "connection_request";
  rows.connection_requests[0].addressee_id = "other";
  expect(await result()).toEqual({ skipped: "REQUEST_UNAVAILABLE" });
  noDevicesRead();
});
it("checks acceptance request parties and current connection", async () => {
  rows.notifications[0].notification_type = "connection_accepted";
  rows.connection_requests[0] = {
    id: 4,
    requester_id: "owner",
    addressee_id: "friend",
    status: "accepted",
  };
  expect(await result()).toEqual({ sent: 0, failed: 0, skipped: 0 });
  rows.connections = [];
  expect(await result()).toEqual({ skipped: "NOT_CONNECTED" });
});
it("fails closed on authoritative query errors", async () => {
  queryError = "encouragements";
  expect((await request()).status).toBe(500);
  noDevicesRead();
});
it("does not resend a claimed notification/device", async () => {
  rows.device_tokens = [
    {
      device_id: "local-device",
      token: "test-token",
      platform: "android",
      user_id: "owner",
      active: true,
    },
  ];
  duplicate = true;
  expect(await result()).toEqual({ sent: 0, failed: 0, skipped: 1 });
  expect(writes).toHaveLength(1);
});
it("records provider failure without rolling back the notification", async () => {
  rows.device_tokens = [
    {
      device_id: "local-device",
      token: "test-token",
      platform: "android",
      user_id: "owner",
      active: true,
    },
  ];
  expect(await result()).toEqual({ sent: 0, failed: 1, skipped: 0 });
  expect(writes[1]).toMatchObject({ status: "failed" });
  expect(writes[1].error_code).not.toContain("test-token");
});

it.each([
  ["encouragement_received", "/?occurrence=2&encouragement=3", "새 응원이 도착했어요"],
  ["connection_request", "/friends/?request=4", "새 친구 요청이 있어요"],
  ["connection_accepted", "/friends/?friend=friend", "친구 요청이 수락됐어요"],
])("sends the authoritative %s target with generic lockscreen text", async (type, target, body) => {
  rows.notifications[0].notification_type = type;
  if (type === "connection_accepted")
    rows.connection_requests[0] = {
      id: 4,
      requester_id: "owner",
      addressee_id: "friend",
      status: "accepted",
    };
  rows.device_tokens = [
    {
      device_id: "local-device",
      token: "test-token",
      platform: "android",
      user_id: "owner",
      active: true,
    },
  ];
  const fetchMock = vi
    .mocked(fetch)
    .mockImplementation(
      async (url) =>
        new Response(
          JSON.stringify(
            String(url).includes("oauth2")
              ? { access_token: "test-access", expires_in: 3600 }
              : { name: "message-id" },
          ),
          { status: 200 },
        ),
    );
  expect(await result()).toEqual({ sent: 1, failed: 0, skipped: 0 });
  const sendCall = fetchMock.mock.calls.find(([url]) => String(url).includes("messages:send"));
  expect(sendCall).toBeDefined();
  expect(JSON.parse(String(sendCall![1]?.body)).message).toEqual({
    token: "test-token",
    notification: { title: "레몬스케줄", body },
    data: { target: target + "&notification=1" },
  });
  expect(writes[1]).toMatchObject({ status: "sent", provider_message_id: "message-id" });
});

it("accepts a daily encouragement without requiring a completed task", async () => {
  rows.notifications[0] = {
    ...rows.notifications[0],
    daily_encouragement_id: 10,
    occurrence_id: null,
    encouragement_id: null,
  };
  rows.daily_encouragements = [
    { id: 10, owner_id: "owner", author_id: "friend", visibility: "visible" },
  ];
  const response = await request();
  expect(response.status).toBe(200);
  expect(from).toHaveBeenCalledWith("device_tokens");
  expect(from).not.toHaveBeenCalledWith("task_occurrences");
});
it.each(["deleted_by_author", "missing"])(
  "does not fetch devices for unavailable daily content (%s)",
  async (visibility) => {
    rows.notifications[0] = {
      ...rows.notifications[0],
      daily_encouragement_id: 10,
      occurrence_id: null,
      encouragement_id: null,
    };
    rows.daily_encouragements =
      visibility === "missing"
        ? []
        : [{ id: 10, owner_id: "owner", author_id: "friend", visibility }];
    expect(await (await request()).json()).toEqual({ skipped: "ENCOURAGEMENT_UNAVAILABLE" });
    expect(from).not.toHaveBeenCalledWith("device_tokens");
  },
);
