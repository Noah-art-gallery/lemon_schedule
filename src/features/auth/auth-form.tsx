"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { AppError } from "@/lib/errors";
import { getDeviceTimeZone } from "@/lib/time";
import { disableNativePush } from "@/features/push/push-service";
import { useAuth } from "./auth-provider";

import { signIn, signUp } from "./auth-service";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const { status } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "authenticated") router.replace("/");
  }, [router, status]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status !== "unauthenticated" && status !== "demo") return;
    setLoading(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      await disableNativePush();
      if (mode === "signup") {
        await signUp({
          email: String(data.get("email") ?? ""),
          password: String(data.get("password") ?? ""),
          displayName: String(data.get("displayName") ?? ""),
          timeZone: String(data.get("timeZone") ?? ""),
        });
      } else {
        await signIn({
          email: String(data.get("email") ?? ""),
          password: String(data.get("password") ?? ""),
        });
      }
      const invite = new URLSearchParams(window.location.search).get("invite")?.trim();
      router.replace(invite ? `/friends/?invite=${encodeURIComponent(invite)}` : "/");
    } catch (cause) {
      setError(cause instanceof AppError ? cause.message : "입력값을 다시 확인해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  const signup = mode === "signup";
  if (status === "loading" || status === "authenticated") {
    return (
      <main className="route-loading" aria-live="polite">
        계정을 확인하고 있어요.
      </main>
    );
  }
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <Brand />
        <div className="auth-card__heading">
          <p className="eyebrow">{signup ? "WELCOME" : "WELCOME BACK"}</p>
          <h1 id="auth-title">{signup ? "레몬 펫과 시작해요" : "다시 만나서 반가워요"}</h1>
          <p>
            {signup
              ? "계정을 만들고 친구와 오늘의 할 일을 나눠보세요."
              : "오늘의 작은 약속을 이어가요."}
          </p>
        </div>
        <form className="form-stack" onSubmit={submit}>
          {signup ? <Field label="닉네임" name="displayName" maxLength={40} required /> : null}
          <Field label="이메일" name="email" type="email" autoComplete="email" required />
          <Field
            label="비밀번호"
            name="password"
            type="password"
            minLength={8}
            autoComplete={signup ? "new-password" : "current-password"}
            required
          />
          {signup ? (
            <Field
              label="시간대"
              name="timeZone"
              defaultValue={getDeviceTimeZone()}
              hint="기기 시간대를 제안했어요. 현재 지역과 맞는지 확인해 주세요."
              required
            />
          ) : null}
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" size="lg" fullWidth loading={loading}>
            {signup ? "회원가입" : "로그인"}
          </Button>
        </form>
        <p className="auth-card__switch">
          {signup ? "이미 계정이 있나요?" : "처음 오셨나요?"}{" "}
          <Link
            href={signup ? "/login" : "/signup"}
            onClick={(event) => {
              const invite = new URLSearchParams(window.location.search).get("invite")?.trim();
              if (invite) {
                event.preventDefault();
                router.push(
                  `${signup ? "/login" : "/signup"}?invite=${encodeURIComponent(invite)}`,
                );
              }
            }}
          >
            {signup ? "로그인" : "회원가입"}
          </Link>
        </p>
      </section>
    </main>
  );
}
