// This public login starter uses only the caller's validated publishable/anon key.
// It never creates a session or signs its own OAuth state.
type Config = { supabaseUrl: string; anonKey?: string };
const origins = new Set([
  "https://lemon-schedule.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3010",
]);

export function createKakaoLoginHandler(config: Config, send: typeof fetch = fetch) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin") ?? "";
    const headers = new Headers({
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Vary: "Origin",
    });
    const reply = (status: number, body: object) =>
      new Response(JSON.stringify(body), { status, headers });
    if (!origins.has(origin)) return reply(403, { code: "FORBIDDEN" });
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set(
      "Access-Control-Allow-Headers",
      "authorization, x-client-info, apikey, content-type",
    );
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return reply(405, { code: "INVALID_INPUT" });

    const key = request.headers.get("apikey") ?? "";
    if (
      !key ||
      key.length > 4096 ||
      (!key.startsWith("sb_publishable_") && key !== config.anonKey)
    ) {
      return reply(401, { code: "UNAUTHENTICATED" });
    }
    try {
      const text = await request.text();
      if (text.length > 2048) return reply(400, { code: "INVALID_INPUT" });
      const input = JSON.parse(text) as { redirectTo?: unknown };
      if (typeof input?.redirectTo !== "string") return reply(400, { code: "INVALID_INPUT" });
      const redirect = new URL(input.redirectTo);
      if (
        redirect.origin !== origin ||
        redirect.pathname !== "/login/" ||
        redirect.hash ||
        [...redirect.searchParams.keys()].some((name) => name !== "invite") ||
        redirect.searchParams.getAll("invite").length > 1 ||
        (redirect.searchParams.get("invite")?.length ?? 0) > 128
      ) {
        return reply(400, { code: "INVALID_INPUT" });
      }
      const base = new URL(config.supabaseUrl);
      if (base.protocol !== "https:" || !base.hostname.endsWith(".supabase.co"))
        return reply(503, { code: "SUPABASE_NOT_CONFIGURED" });
      const settings = await send(new URL("/auth/v1/settings", base), {
        headers: { apikey: key },
        redirect: "error",
        signal: AbortSignal.timeout(8000),
      });
      if (!settings.ok) return reply(401, { code: "UNAUTHENTICATED" });
      const auth = new URL("/auth/v1/authorize", base);
      auth.searchParams.set("provider", "kakao");
      auth.searchParams.set("redirect_to", redirect.toString());
      auth.searchParams.set("scope", "profile_nickname");
      const response = await send(auth, {
        headers: { apikey: key, Referer: origin + "/" },
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
      });
      if (response.status !== 302) return reply(502, { code: "INVALID_INPUT" });
      const authorization = new URL(response.headers.get("location") ?? "");
      const state = authorization.searchParams.get("state");
      const redirectUri = new URL("/auth/v1/callback", base).toString();
      if (
        authorization.origin !== "https://kauth.kakao.com" ||
        authorization.pathname !== "/oauth/authorize" ||
        authorization.searchParams.get("redirect_uri") !== redirectUri ||
        authorization.searchParams.get("scope") !== "profile_nickname" ||
        !state ||
        state.length > 4096
      ) {
        return reply(502, { code: "INVALID_INPUT" });
      }
      return reply(200, { state, redirectUri });
    } catch {
      return reply(400, { code: "INVALID_INPUT" });
    }
  };
}

const runtime = globalThis as typeof globalThis & {
  Deno?: {
    env: { get(name: string): string | undefined };
    serve(handler: (request: Request) => Promise<Response>): void;
  };
};
if (runtime.Deno) {
  runtime.Deno.serve(
    createKakaoLoginHandler({
      supabaseUrl: runtime.Deno.env.get("SUPABASE_URL") ?? "",
      anonKey: runtime.Deno.env.get("SUPABASE_ANON_KEY"),
    }),
  );
}
