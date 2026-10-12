import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { ProfileScreen } from "./profile-screen";
const mocks = vi.hoisted(() => ({
  getProfileDetails: vi.fn(),
  updateProfile: vi.fn(),
  unblockUser: vi.fn(),
  getDevicePushState: vi.fn(),
  registerPushToken: vi.fn(),
  unregisterPushToken: vi.fn(),
  signOut: vi.fn(),
  replace: vi.fn(),
}));
const user = { id: "owner" };
vi.mock("@/features/auth/auth-provider", () => ({ useAuth: () => ({ user, demo: false }) }));
vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("./profile-service", () => mocks);
vi.mock("@/features/push/push-service", () => mocks);
vi.mock("@/features/auth/auth-service", () => mocks);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getProfileDetails.mockResolvedValue({
    displayName: "지민",
    timeZone: "Asia/Seoul",
    inviteCode: "LEMON1",
    lemonPoints: 3,
    petLevel: 1,
    blocked: [{ id: "friend", displayName: "민수" }],
  });
  mocks.getDevicePushState.mockResolvedValue({ status: "unsupported" });
});
it("실패한 프로필 입력을 유지하고 재시도한다", async () => {
  mocks.updateProfile
    .mockRejectedValueOnce(new Error("저장 실패"))
    .mockResolvedValueOnce({ displayName: "새 이름", timeZone: "Asia/Seoul" });
  render(<ProfileScreen />);
  await screen.findByText("지민");
  fireEvent.click(screen.getByRole("button", { name: "프로필 수정" }));
  const input = screen.getByLabelText("닉네임");
  fireEvent.change(input, { target: { value: "새 이름" } });
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("저장 실패");
  expect(input).toHaveValue("새 이름");
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByText("새 이름")).toBeInTheDocument();
});
it("웹에서는 알림 켜기를 제공하지 않는다", async () => {
  render(<ProfileScreen />);
  expect(await screen.findByText("휴대폰 앱에서 설정할 수 있어요")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "알림 켜기" })).not.toBeInTheDocument();
});
it("알림 해제 실패를 성공으로 표시하지 않고 재조회한다", async () => {
  mocks.getDevicePushState.mockResolvedValue({ status: "on" });
  mocks.unregisterPushToken.mockRejectedValue(new Error("해제 실패"));
  render(<ProfileScreen />);
  fireEvent.click(await screen.findByRole("button", { name: "알림 끄기" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("해제 실패");
  expect(screen.queryByText("꺼짐")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "알림 상태 다시 확인" }));
  expect(await screen.findByRole("button", { name: "알림 끄기" })).toBeInTheDocument();
});
it("차단 해제의 의미를 확인하고 실패하면 목록을 보존한다", async () => {
  mocks.unblockUser.mockRejectedValue(new Error("해제 실패"));
  render(<ProfileScreen />);
  await screen.findByText("지민");
  fireEvent.click(screen.getByRole("button", { name: /차단한 사용자/ }));
  const dialog = screen.getByRole("dialog");
  expect(
    within(dialog).getByText("차단을 해제해도 친구로 다시 연결되지 않아요"),
  ).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: "민수 차단 해제" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("해제 실패");
  expect(within(dialog).getByText("민수")).toBeInTheDocument();
});
it("로그아웃 정리 실패 때 화면을 유지하고 중복 기기 해제를 하지 않는다", async () => {
  mocks.signOut.mockRejectedValue(new Error("로그아웃 실패"));
  render(<ProfileScreen />);
  await screen.findByText("지민");
  fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("로그아웃 실패");
  expect(mocks.unregisterPushToken).not.toHaveBeenCalled();
  expect(mocks.replace).not.toHaveBeenCalled();
});
it("마지막 차단 해제 후에도 패널 안에 초점을 유지한다", async () => {
  mocks.unblockUser.mockResolvedValue(undefined);
  render(<ProfileScreen />);
  await screen.findByText("지민");
  fireEvent.click(screen.getByRole("button", { name: /차단한 사용자/ }));
  fireEvent.click(screen.getByRole("button", { name: "민수 차단 해제" }));
  await screen.findByText("차단한 사용자가 없어요");
  expect(screen.getByText("차단을 해제해도 친구로 다시 연결되지 않아요")).toHaveFocus();
});
