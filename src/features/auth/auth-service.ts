import { Capacitor } from "@capacitor/core";
import { z } from "zod";

import { withPushAccountCleanup } from "@/features/push/push-service";
import { AppError } from "@/lib/errors";
import { getSupabaseClient } from "@/lib/supabase/client";

function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError(
      "INVALID_INPUT",
      result.error.issues[0]?.message ?? "입력값을 확인해 주세요.",
    );
  }
  return result.data;
}

export async function signOut(): Promise<void> {
  await withPushAccountCleanup(async () => {
    const { error } = await getSupabaseClient().auth.signOut();
    if (error) throw new AppError("INVALID_INPUT", "로그아웃하지 못했어요. 다시 시도해 주세요.");
  });
}

export async function signInWithKakao(invite?: string): Promise<void> {
  const inviteCode = validate(
    z.string().trim().max(128, "초대 코드를 확인해 주세요.").optional(),
    invite,
  );
  if (Capacitor.isNativePlatform()) {
    throw new AppError("INVALID_INPUT", "카카오 로그인은 웹에서 먼저 이용해 주세요.");
  }
  const client = getSupabaseClient();
  const { data: current, error: sessionError } = await client.auth.getSession();
  if (sessionError)
    throw new AppError("INVALID_INPUT", "계정을 확인하지 못했어요. 다시 시도해 주세요.");
  if (current.session)
    throw new AppError("CONFLICT", "다른 계정으로 로그인하려면 먼저 로그아웃해 주세요.");
  const redirect = new URL("/login/", window.location.origin);
  if (inviteCode) redirect.searchParams.set("invite", inviteCode);
  const { error } = await client.auth.signInWithOAuth({
    provider: "kakao",
    // `scopes` appends to Supabase's Kakao defaults (which include email/photo).
    // Override the provider's OAuth scope to request only the nickname we use.
    options: { redirectTo: redirect.toString(), queryParams: { scope: "profile_nickname" } },
  });
  if (error) {
    throw new AppError(
      error.status === 429 ? "RATE_LIMITED" : "INVALID_INPUT",
      "카카오 로그인을 시작하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
    );
  }
}
