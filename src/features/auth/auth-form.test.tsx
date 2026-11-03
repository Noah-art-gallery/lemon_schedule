import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/errors";
import { getDeviceTimeZone } from "@/lib/time";

import { AuthForm } from "./auth-form";

const { replace, authState, disableNativePush, signIn, signUp } = vi.hoisted(() => ({
  replace: vi.fn(),
  authState: { status: "authenticated" },
  disableNativePush: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("./auth-provider", () => ({
  useAuth: () => ({ status: authState.status, user: { id: "current-user" }, demo: false }),
}));
vi.mock("@/features/push/push-service", () => ({ disableNativePush }));
vi.mock("./auth-service", () => ({ signIn, signUp }));

describe("인증된 계정의 로그인 진입", () => {
  beforeEach(() => {
    authState.status = "authenticated";
    replace.mockReset();
    disableNativePush.mockReset();
    signIn.mockReset();
    signUp.mockReset();
  });

  it("시간대 입력 없이 기기 시간대를 가입 계약에 전달한다", async () => {
    authState.status = "unauthenticated";
    disableNativePush.mockResolvedValue(undefined);
    signUp.mockResolvedValue(undefined);
    render(<AuthForm mode="signup" />);
    expect(screen.queryByLabelText("시간대")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("닉네임"), { target: { value: "레몬" } });
    fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "lemon@example.com" } });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "회원가입" }));
    await waitFor(() =>
      expect(signUp).toHaveBeenCalledWith({
        email: "lemon@example.com",
        password: "password123",
        displayName: "레몬",
        timeZone: getDeviceTimeZone(),
      }),
    );
    expect(replace).toHaveBeenCalledWith("/");
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

  it("로그인 실패 뒤 입력을 보존하고 중복 전송을 막는다", async () => {
    authState.status = "unauthenticated";
    disableNativePush.mockResolvedValue(undefined);
    let reject!: (error: AppError) => void;
    signIn.mockReturnValue(
      new Promise((_, fail) => {
        reject = fail;
      }),
    );
    render(<AuthForm mode="login" />);
    const email = screen.getByRole("textbox", { name: "이메일" });
    const password = screen.getByLabelText("비밀번호");
    fireEvent.change(email, { target: { value: "friend@example.com" } });
    fireEvent.change(password, { target: { value: "password123" } });
    const submit = screen.getByRole("button", { name: "로그인" });
    fireEvent.click(submit);
    fireEvent.submit(submit.closest("form")!);
    await waitFor(() => expect(signIn).toHaveBeenCalledOnce());
    reject(new AppError("INVALID_INPUT", "로그인 실패"));
    expect(await screen.findByRole("alert")).toHaveTextContent("로그인 실패");
    expect(email).toHaveValue("friend@example.com");
    expect(password).toHaveValue("password123");
    expect(replace).not.toHaveBeenCalled();
  });
});
