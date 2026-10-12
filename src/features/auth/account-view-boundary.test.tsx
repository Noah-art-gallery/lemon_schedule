import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./auth-provider";
import { HomeScreen } from "@/features/home/home-screen";
import { demoGetDetail } from "@/features/tasks/demo-task-store";
import { getOccurrenceDetail, listOwnHistory } from "@/features/tasks/task-service";

const auth = vi.hoisted(() => ({
  listener: null as null | ((event: AuthChangeEvent, session: Session | null) => void),
}));
vi.mock("@/lib/env", () => ({ hasSupabaseConfig: () => true, isDemoMode: () => false }));
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: { user: { id: "account-a" } } } }),
      onAuthStateChange: (listener: typeof auth.listener) => {
        auth.listener = listener;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
  }),
}));
vi.mock("@/features/push/push-service", () => ({ disableNativePush: vi.fn() }));
vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/features/tasks/task-service", async (original) => ({
  ...(await original<typeof import("@/features/tasks/task-service")>()),
  listOccurrenceWindow: vi.fn().mockResolvedValue({ today: "2026-10-12", occurrences: [] }),
  listOwnHistory: vi.fn(),
  getOccurrenceDetail: vi.fn(),
}));
vi.mock("@/features/pet/pet-service", () => ({
  getPetDetails: vi.fn().mockRejectedValue(new Error("No saved drawing")),
  getPetDrawingUrl: vi.fn(),
}));
function AccountScreen() {
  const { user } = useAuth();
  return (
    <>
      <span data-testid="account">{user?.id}</span>
      <HomeScreen />
    </>
  );
}
async function openApp() {
  render(
    <AuthProvider>
      <AccountScreen />
    </AuthProvider>,
  );
  await waitFor(() => expect(screen.getByTestId("account")).toHaveTextContent("account-a"));
}
function authenticate(id: string, event: AuthChangeEvent = "SIGNED_IN") {
  act(() => auth.listener?.(event, { user: { id } } as Session));
}
function history(title: string) {
  const detail = demoGetDetail(1);
  detail.occurrence.title_snapshot = title;
  detail.occurrence.owner_id = "account-a";
  detail.owner = { id: "account-a", displayName: "A", avatarKey: "lemon" };
  return {
    detail,
    result: {
      items: [{ occurrence: detail.occurrence, taskDeleted: false, summary: detail.summary }],
      nextCursor: null,
    },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  auth.listener = null;
  vi.mocked(listOwnHistory).mockResolvedValue({ items: [], nextCursor: null });
});
it("immediately removes the prior account's history and open detail on an auth event", async () => {
  const first = history("A의 비공개 완료 기록");
  vi.mocked(listOwnHistory).mockResolvedValue(first.result);
  vi.mocked(getOccurrenceDetail).mockResolvedValue(first.detail);
  await openApp();
  fireEvent.click(screen.getByRole("tab", { name: "기록" }));
  fireEvent.click(await screen.findByText("A의 비공개 완료 기록"));
  await screen.findByRole("heading", { name: "A의 비공개 완료 기록" });
  authenticate("account-b");
  expect(screen.getByTestId("account")).toHaveTextContent("account-b");
  expect(screen.queryAllByText("A의 비공개 완료 기록")).toHaveLength(0);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("preserves the same account's editor on token refresh but discards it on an account change", async () => {
  await openApp();
  fireEvent.click(screen.getByRole("button", { name: "할 일 추가" }));
  const input = screen.getByRole("textbox", { name: "할 일" });
  fireEvent.change(input, { target: { value: "아직 저장하지 않은 초안" } });
  authenticate("account-a", "TOKEN_REFRESHED");
  expect(screen.getByRole("textbox", { name: "할 일" })).toBe(input);
  expect(input).toHaveValue("아직 저장하지 않은 초안");
  authenticate("account-b");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByDisplayValue("아직 저장하지 않은 초안")).not.toBeInTheDocument();
});
it("does not let a late old-account history response replace the new account's history", async () => {
  let resolveOld!: (value: ReturnType<typeof history>["result"]) => void;
  vi.mocked(listOwnHistory).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
  );
  await openApp();
  fireEvent.click(screen.getByRole("tab", { name: "기록" }));
  await waitFor(() => expect(listOwnHistory).toHaveBeenCalledTimes(1));
  authenticate("account-b");
  vi.mocked(listOwnHistory).mockResolvedValue(history("B의 완료 기록").result);
  fireEvent.click(screen.getByRole("tab", { name: "기록" }));
  await screen.findByText("B의 완료 기록");
  await act(async () => resolveOld(history("늦게 도착한 A 기록").result));
  expect(screen.queryByText("늦게 도착한 A 기록")).not.toBeInTheDocument();
  expect(screen.getByText("B의 완료 기록")).toBeInTheDocument();
});
it("does not reopen a prior account's detail when its pending response arrives", async () => {
  const first = history("A 상세 응답 대기");
  let resolveOld!: (value: typeof first.detail) => void;
  vi.mocked(listOwnHistory).mockResolvedValue(first.result);
  vi.mocked(getOccurrenceDetail).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
  );
  await openApp();
  fireEvent.click(screen.getByRole("tab", { name: "기록" }));
  fireEvent.click(await screen.findByText("A 상세 응답 대기"));
  await waitFor(() => expect(getOccurrenceDetail).toHaveBeenCalledTimes(1));
  authenticate("account-b");
  await act(async () => resolveOld(first.detail));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryAllByText("A 상세 응답 대기")).toHaveLength(0);
});
