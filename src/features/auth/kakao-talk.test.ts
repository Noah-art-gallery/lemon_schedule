import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({ functions: { invoke: mocks.invoke } }),
}));
const key = "0123456789abcdef0123456789abcdef";
const redirect = "https://lemon-schedule.vercel.app/login/?invite=LEMON123";
describe("KakaoTalk SDK handoff", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY", key);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    mocks.invoke.mockReset().mockResolvedValue({
      data: {
        state: "server-state",
        redirectUri: "https://project.supabase.co/auth/v1/callback",
      },
      error: null,
    });
    window.Kakao = {
      init: vi.fn(),
      isInitialized: () => true,
      Auth: { getAppKey: () => key, authorize: vi.fn() },
    };
  });
  afterEach(() => {
    delete window.Kakao;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  it("prepares once then hands the exact server state to Kakao with app-first authentication", async () => {
    const { prepareKakaoTalkLogin, startKakaoTalkLogin } = await import("./kakao-talk");
    await prepareKakaoTalkLogin(redirect);
    expect(await startKakaoTalkLogin(redirect)).toBe(true);
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith("start-kakao-login", {
      body: { redirectTo: redirect },
    });
    expect(window.Kakao!.Auth.authorize).toHaveBeenCalledWith({
      state: "server-state",
      redirectUri: "https://project.supabase.co/auth/v1/callback",
      scope: "profile_nickname",
      throughTalk: true,
    });
    await startKakaoTalkLogin(redirect);
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
  });
  it("keeps REST fallback available without an SDK key", async () => {
    vi.stubEnv("NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY", "");
    const { startKakaoTalkLogin } = await import("./kakao-talk");
    expect(await startKakaoTalkLogin(redirect)).toBe(false);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it("does not call the SDK with a mismatched callback or failed state creation", async () => {
    mocks.invoke.mockResolvedValue({
      data: { state: "state", redirectUri: "https://attacker.example/" },
      error: null,
    });
    const { startKakaoTalkLogin } = await import("./kakao-talk");
    expect(await startKakaoTalkLogin(redirect)).toBe(false);
    expect(window.Kakao!.Auth.authorize).not.toHaveBeenCalled();
    mocks.invoke.mockResolvedValue({ data: null, error: new Error("Unavailable") });
    expect(await startKakaoTalkLogin(redirect)).toBe(false);
  });
  it("does not reuse a state prepared for a different invite", async () => {
    const { prepareKakaoTalkLogin } = await import("./kakao-talk");
    await prepareKakaoTalkLogin(redirect);
    await prepareKakaoTalkLogin(redirect.replace("LEMON123", "OTHER123"));
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
  });
  it("renews expired state and keeps a REST fallback if the SDK rejects the launch", async () => {
    const { prepareKakaoTalkLogin, startKakaoTalkLogin } = await import("./kakao-talk");
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
    await prepareKakaoTalkLogin(redirect);
    clock.mockReturnValue(122000);
    vi.mocked(window.Kakao!.Auth.authorize).mockImplementation(() => {
      throw new Error("SDK unavailable");
    });
    expect(await startKakaoTalkLogin(redirect)).toBe(false);
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
  });
});
