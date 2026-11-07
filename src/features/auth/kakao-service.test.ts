import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: null as object | null,
  getSession: vi.fn(),
  oauth: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: { getSession: mocks.getSession, signInWithOAuth: mocks.oauth },
  }),
}));
import { signInWithKakao } from "./auth-service";

describe("Kakao OAuth", () => {
  beforeEach(() => {
    mocks.getSession.mockReset().mockResolvedValue({ data: { session: null }, error: null });
    mocks.oauth.mockReset().mockResolvedValue({ data: {}, error: null });
  });
  it("uses a same-origin static callback and preserves invite text as a query value", async () => {
    await signInWithKakao("LEMON&next=https://example.com");
    const call = mocks.oauth.mock.calls[0][0];
    const callback = new URL(call.options.redirectTo);
    expect(callback.origin).toBe(window.location.origin);
    expect(callback.pathname).toBe("/login/");
    expect(callback.searchParams.get("invite")).toBe("LEMON&next=https://example.com");
    expect(call.provider).toBe("kakao");
    expect(call.options.queryParams).toEqual({ scope: "profile_nickname" });
  });
  it("does not replace a signed-in account", async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: "existing" } } },
      error: null,
    });
    await expect(signInWithKakao()).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.oauth).not.toHaveBeenCalled();
  });
  it("maps provider failures to AppError without provider error text", async () => {
    mocks.oauth.mockResolvedValue({ error: { status: 429, message: "private detail" } });
    await expect(signInWithKakao()).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});
