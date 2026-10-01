import type { AuthError, Session } from "@supabase/supabase-js";
import { z } from "zod";

import { AppError } from "@/lib/errors";
import { getSupabaseClient } from "@/lib/supabase/client";
import { isValidTimeZone } from "@/lib/time";

export const signUpSchema = z.object({
  email: z.email("올바른 이메일을 입력해 주세요."),
  password: z.string().min(8, "비밀번호는 8자 이상이어야 해요."),
  displayName: z.string().trim().min(1, "닉네임을 입력해 주세요.").max(40),
  timeZone: z.string().trim().refine(isValidTimeZone, "올바른 IANA 시간대를 입력해 주세요."),
});

export const signInSchema = z.object({
  email: z.email("올바른 이메일을 입력해 주세요."),
  password: z.string().min(1, "비밀번호를 입력해 주세요."),
});

export function authFailure(error: Pick<AuthError, "message" | "status">): AppError {
  const duplicate = /already registered|already been registered/i.test(error.message);
  const rateLimited = error.status === 429;
  return new AppError(
    rateLimited ? "RATE_LIMITED" : duplicate ? "CONFLICT" : "INVALID_INPUT",
    rateLimited
      ? "요청이 너무 많아요. 잠시 뒤 다시 시도해 주세요."
      : duplicate
        ? "이미 가입된 이메일이에요."
        : "이메일 또는 비밀번호를 확인해 주세요.",
  );
}

export interface SignUpResult {
  userId: string;
  profileId: string;
  inviteCode: string;
  timeZone: string;
}

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

export async function signUp(input: z.input<typeof signUpSchema>): Promise<SignUpResult> {
  const values = validate(signUpSchema, input);
  const { data, error } = await getSupabaseClient().auth.signUp({
    email: values.email,
    password: values.password,
    options: {
      data: { display_name: values.displayName, time_zone: values.timeZone },
    },
  });

  if (error) throw authFailure(error);
  if (!data.user || !data.session) {
    throw new AppError(
      "INVALID_INPUT",
      "즉시 로그인을 사용하려면 Supabase 이메일 확인 옵션을 꺼 주세요.",
    );
  }
  const { data: profile, error: profileError } = await getSupabaseClient()
    .from("profile_private")
    .select("invite_code, time_zone")
    .eq("user_id", data.user.id)
    .single();
  if (profileError || !profile) {
    throw new AppError("INVALID_INPUT", "가입 프로필을 불러오지 못했어요.");
  }
  return {
    userId: data.user.id,
    profileId: data.user.id,
    inviteCode: profile.invite_code,
    timeZone: profile.time_zone,
  };
}

export async function signIn(
  input: z.input<typeof signInSchema>,
): Promise<{ userId: string; session: Session }> {
  const values = validate(signInSchema, input);
  const { data, error } = await getSupabaseClient().auth.signInWithPassword(values);
  if (error || !data.user || !data.session) {
    throw authFailure(error ?? ({ message: "Login failed" } as AuthError));
  }
  return { userId: data.user.id, session: data.session };
}

export async function signOut(): Promise<void> {
  const { error } = await getSupabaseClient().auth.signOut();
  if (error) throw new AppError("INVALID_INPUT", "로그아웃하지 못했어요. 다시 시도해 주세요.");
}
