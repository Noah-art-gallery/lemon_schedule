import { afterAll, beforeAll, expect, it, vi } from "vitest";

let handler: (request: Request) => Promise<Response>;
const secret = "this-is-a-local-test-secret-at-least-32-characters";

beforeAll(async () => {
  vi.stubGlobal("Deno", {
    env: { get: (name: string) => (name === "PUSH_WEBHOOK_SECRET" ? secret : undefined) },
    serve: (next: (request: Request) => Promise<Response>) => {
      handler = next;
    },
  });
  await import("./index");
});

afterAll(() => {
  vi.unstubAllGlobals();
});

it("rejects a missing or incorrect webhook secret before reading project data", async () => {
  const missing = await handler(new Request("https://example.test/push", { method: "POST" }));
  expect(missing.status).toBe(401);

  const incorrect = await handler(
    new Request("https://example.test/push", {
      method: "POST",
      headers: { "x-lemon-webhook-secret": secret + "x" },
    }),
  );
  expect(incorrect.status).toBe(401);
});

it("rejects non-insert and malformed events", async () => {
  const response = await handler(
    new Request("https://example.test/push", {
      method: "POST",
      headers: { "x-lemon-webhook-secret": secret },
      body: JSON.stringify({ type: "UPDATE", table: "notifications", record: { id: 1 } }),
    }),
  );
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "INVALID_EVENT" });
});
