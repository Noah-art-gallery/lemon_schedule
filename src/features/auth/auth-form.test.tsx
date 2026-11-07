import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/errors";
import { AuthForm } from "./auth-form";

const { replace, authState, disableNativePush, signInWithKakao } = vi.hoisted(() => ({
  replace: vi.fn(),
  authState: { status: "unauthenticated" },
  disableNativePush: vi.fn(),
  signInWithKakao: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("./auth-provider", () => ({ useAuth: () => ({ status: authState.status }) }));
vi.mock("@/features/push/push-service", () => ({ disableNativePush }));
vi.mock("./auth-service", () => ({
  signInWithKakao,
  warmKakaoLogin: vi.fn().mockResolvedValue(undefined),
}));

describe("카카오 전용 로그인", () => {
  beforeEach(() => {
    authState.status = "unauthenticated";
    replace.mockReset();
    disableNativePush.mockReset().mockResolvedValue(undefined);
    signInWithKakao.mockReset().mockResolvedValue(undefined);
    window.history.replaceState(null, "", "/login/");
  });
  it("이메일·비밀번호·회원가입 없이 카카오 시작만 제공한다", () => {
    render(<AuthForm />);
    expect(screen.getByRole("button", { name: "카카오로 시작하기" })).toBeEnabled();
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryByLabelText("비밀번호")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "회원가입" })).not.toBeInTheDocument();
    expect(screen.getByText("처음이라면 카카오 로그인 후 바로 시작할 수 있어요.")).toBeVisible();
  });
  it("예전 가입 주소의 초대를 로그인으로 이어간다", async () => {
    window.history.replaceState(null, "", "/signup/?invite=LEMON123");
    render(<AuthForm />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login/?invite=LEMON123"));
    expect(screen.queryByLabelText("이메일")).not.toBeInTheDocument();
  });
  it("로그인된 계정은 초대 목적지로 이동하고 인증을 덮어쓰지 않는다", async () => {
    authState.status = "authenticated";
    window.history.replaceState(null, "", "/login/?invite=LEMON123");
    render(<AuthForm />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/friends/?invite=LEMON123"));
    expect(signInWithKakao).not.toHaveBeenCalled();
  });
  it("푸시 해제 실패 시 카카오 인증을 시작하지 않고 재시도를 허용한다", async () => {
    disableNativePush.mockRejectedValue(new AppError("INVALID_INPUT", "알림 등록 해제 실패"));
    render(<AuthForm />);
    const button = screen.getByRole("button", { name: "카카오로 시작하기" });
    fireEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent("알림 등록 해제 실패");
    expect(signInWithKakao).not.toHaveBeenCalled();
    expect(button).toBeEnabled();
  });
  it("카카오 중복 요청을 막고 실패 뒤 버튼을 복구한다", async () => {
    window.history.replaceState(null, "", "/login/?invite=LEMON123");
    let fail!: (error: AppError) => void;
    signInWithKakao.mockReturnValue(
      new Promise((_, reject) => {
        fail = reject;
      }),
    );
    render(<AuthForm />);
    const button = screen.getByRole("button", { name: "카카오로 시작하기" });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(signInWithKakao).toHaveBeenCalledExactlyOnceWith("LEMON123"));
    expect(disableNativePush).toHaveBeenCalledOnce();
    expect(button).toBeDisabled();
    fail(new AppError("INVALID_INPUT", "카카오 연결 실패"));
    expect(await screen.findByRole("alert")).toHaveTextContent("카카오 연결 실패");
    expect(button).toBeEnabled();
  });
  it("StrictMode에서도 OAuth 오류 원문을 제거하고 초대를 유지한다", async () => {
    window.history.replaceState(
      null,
      "",
      "/login/?invite=LEMON123#error=access_denied&error_description=private-detail",
    );
    render(
      <StrictMode>
        <AuthForm />
      </StrictMode>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "카카오 로그인을 완료하지 못했어요.",
    );
    expect(window.location.hash).toBe("");
    expect(window.location.search).toBe("?invite=LEMON123");
  });
  it("데모에서는 실제 카카오 인증을 시작하지 않는다", () => {
    authState.status = "demo";
    render(<AuthForm />);
    const button = screen.getByRole("button", { name: "카카오로 시작하기" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(signInWithKakao).not.toHaveBeenCalled();
  });
});
