import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/errors";

import { AuthForm } from "./auth-form";

const { replace, authState, disableNativePush, signIn } = vi.hoisted(() => ({
  replace: vi.fn(),
  authState: { status: "authenticated" },
  disableNativePush: vi.fn(),
  signIn: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("./auth-provider", () => ({
  useAuth: () => ({ status: authState.status, user: { id: "current-user" }, demo: false }),
}));
vi.mock("@/features/push/push-service", () => ({ disableNativePush }));
vi.mock("./auth-service", () => ({ signIn, signUp: vi.fn() }));

describe("인증된 계정의 로그인 진입", () => {
  beforeEach(() => {
    authState.status = "authenticated";
    replace.mockReset();
    disableNativePush.mockReset();
    signIn.mockReset();
  });

  it("다른 계정 입력을 보여 주지 않고 앱으로 돌려보낸다", async () => {
    render(<AuthForm mode="login" />);
    expect(screen.queryByRole("textbox", { name: "이메일" })).not.toBeInTheDocument();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("푸시 등록 해제에 실패하면 다른 계정 로그인을 시작하지 않는다", async () => {
    authState.status = "unauthenticated";
    disableNativePush.mockRejectedValue(
      new AppError("INVALID_INPUT", "휴대폰 알림 등록을 해제하지 못했어요."),
    );
    render(<AuthForm mode="login" />);
    fireEvent.change(screen.getByRole("textbox", { name: "이메일" }), {
      target: { value: "friend@example.com" },
    });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
    await waitFor(() => expect(disableNativePush).toHaveBeenCalledOnce());
    expect(signIn).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "휴대폰 알림 등록을 해제하지 못했어요.",
    );
  });
});
