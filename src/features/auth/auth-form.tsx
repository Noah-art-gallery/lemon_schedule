"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { AppError } from "@/lib/errors";
import { disableNativePush } from "@/features/push/push-service";
import { useAuth } from "./auth-provider";

import { signInWithKakao, warmKakaoLogin } from "./auth-service";
import styles from "./auth-form.module.css";

export function AuthForm() {
  const router = useRouter();
  const { status } = useAuth();
  const pending = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status !== "unauthenticated") return;
    const warm = () => {
      void warmKakaoLogin(
        new URLSearchParams(window.location.search).get("invite") ?? undefined,
      ).catch(() => {});
    };
    warm();
    window.addEventListener("focus", warm);
    return () => window.removeEventListener("focus", warm);
  }, [status]);

  useEffect(() => {
    if (status === "authenticated") {
      const invite = new URLSearchParams(window.location.search).get("invite")?.trim();
      router.replace(invite ? `/friends/?invite=${encodeURIComponent(invite)}` : "/");
    } else if (window.location.pathname.replace(/\/$/, "") === "/signup") {
      router.replace(`/login/${window.location.search}${window.location.hash}`);
    }
  }, [router, status]);

  useEffect(() => {
    let active = true;
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    if (hash.has("error") || query.has("error")) {
      queueMicrotask(() => {
        if (!active) return;
        setError("카카오 로그인을 완료하지 못했어요. 다시 시도해 주세요.");
        const clean = new URL(window.location.href);
        clean.hash = "";
        for (const key of ["error", "error_code", "error_description"])
          clean.searchParams.delete(key);
        window.history.replaceState(null, "", clean.pathname + clean.search);
      });
    }
    return () => {
      active = false;
    };
  }, []);

  async function kakaoLogin() {
    if (pending.current || status !== "unauthenticated") return;
    pending.current = true;
    setLoading(true);
    setError("");
    try {
      await disableNativePush();
      await signInWithKakao(new URLSearchParams(window.location.search).get("invite") ?? undefined);
    } catch (cause) {
      setError(cause instanceof AppError ? cause.message : "카카오 로그인을 시작하지 못했어요.");
    } finally {
      pending.current = false;
      setLoading(false);
    }
  }

  if (status === "loading" || status === "authenticated") {
    return (
      <main className="route-loading" aria-live="polite">
        계정을 확인하고 있어요.
      </main>
    );
  }
  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="auth-title">
        <Brand />
        <div className={styles.heading}>
          <h1 id="auth-title">로그인</h1>
          <p>하나씩 해내고, 서로 응원해요</p>
          <p>친구·가족과 할 일을 공유하고, 하나씩 해내며 나만의 펫을 키워요.</p>
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <Button
          className={styles.kakao}
          size="lg"
          fullWidth
          loading={loading}
          disabled={status === "demo"}
          onClick={() => void kakaoLogin()}
        >
          카카오로 시작하기
        </Button>
        <p className={styles.notice}>처음이라면 카카오 로그인 후 바로 시작할 수 있어요.</p>
      </section>
    </main>
  );
}
