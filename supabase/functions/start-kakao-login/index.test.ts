// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createKakaoLoginHandler } from "./index";

const base = "https://project.supabase.co";
const origin = "https://lemon-schedule.vercel.app";
const callback = base + "/auth/v1/callback";
const send = vi.fn<typeof fetch>();
const handler = createKakaoLoginHandler({ supabaseUrl: base }, send);
function request(redirectTo = origin + "/login/?invite=LEMON123", from = origin) {
  return new Request(base + "/functions/v1/start-kakao-login", {
    method: "POST",
    headers: { Origin: from, apikey: "sb_publishable_test", "Content-Type": "application/json" },
    body: JSON.stringify({ redirectTo }),
  });
}
describe("public Kakao OAuth starter", () => {
  beforeEach(() => {
    send.mockReset().mockResolvedValueOnce(new Response("{}"));
    const authorization = new URL("https://kauth.kakao.com/oauth/authorize");
    authorization.searchParams.set("state", "server-issued-once");
    authorization.searchParams.set("redirect_uri", callback);
    authorization.searchParams.set("scope", "profile_nickname");
    send.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { Location: authorization.toString() } }),
    );
  });
  it("relays server-issued state and preserves invite without following the provider redirect", async () => {
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ state: "server-issued-once", redirectUri: callback });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    const target = new URL(String(send.mock.calls[1][0]));
    expect(target.searchParams.get("redirect_to")).toBe(origin + "/login/?invite=LEMON123");
    expect(target.searchParams.get("scope")).toBe("profile_nickname");
    expect(send.mock.calls[1][1]?.redirect).toBe("manual");
    expect(send.mock.calls[0][1]?.headers).toEqual({ apikey: "sb_publishable_test" });
  });
  it.each([
    ["https://attacker.example/login/", origin],
    [origin + "/login/", "https://attacker.example"],
    [origin + "/login/?next=https://attacker.example", origin],
    [origin + "/profile/", origin],
    [origin + "/login/#access_token=fake", origin],
  ])(
    "rejects unapproved origins or redirect fields before contacting Auth",
    async (redirect, from) => {
      expect((await handler(request(redirect, from))).status).toBeGreaterThanOrEqual(400);
      expect(send).not.toHaveBeenCalled();
    },
  );
  it("validates the project publishable key and does not start OAuth for an invalid key", async () => {
    send.mockReset().mockResolvedValue(new Response("{}", { status: 401 }));
    expect((await handler(request())).status).toBe(401);
    expect(send).toHaveBeenCalledOnce();
  });
  it("does not relay an unexpected upstream callback or host", async () => {
    send
      .mockReset()
      .mockResolvedValueOnce(new Response("{}"))
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: "https://attacker.example/?state=forged" },
        }),
      );
    expect((await handler(request())).status).toBe(502);
  });
  it("allows only approved CORS preflights without starting a flow", async () => {
    const response = await handler(
      new Request(base, { method: "OPTIONS", headers: { Origin: origin } }),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(send).not.toHaveBeenCalled();
  });
});
