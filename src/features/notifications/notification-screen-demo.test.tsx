import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { NotificationScreen } from "./notification-screen";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/features/auth/auth-provider", () => ({ useAuth: () => ({ demo: true, user: null }) }));
vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
it("keeps the actual detail through hiding, restoring and returning to a draft", async () => {
  Element.prototype.scrollIntoView = vi.fn();
  render(<NotificationScreen />);
  fireEvent.click(await screen.findByRole("button", { name: /지민의 응원/ }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(await within(dialog).findByLabelText("지민 응원 메뉴"));
  fireEvent.click(within(dialog).getByRole("button", { name: "숨기기" }));
  const hidden = await within(dialog).findByText(/숨긴 응원/);
  fireEvent.click(hidden);
  fireEvent.click(within(dialog).getByLabelText("지민 응원 메뉴"));
  fireEvent.click(within(dialog).getByRole("button", { name: "다시 표시" }));
  await within(dialog).findByText("오늘도 잊지 않고 했네!");
  expect(screen.getByRole("dialog")).toBe(dialog);
  fireEvent.click(within(dialog).getByLabelText("할 일 메뉴"));
  fireEvent.click(within(dialog).getByRole("button", { name: "수정" }));
  const input = await within(dialog).findByLabelText("할 일");
  fireEvent.change(input, { target: { value: "작성 중인 제목" } });
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(within(dialog).getByLabelText("할 일")).toBe(input);
  expect(input).toHaveValue("작성 중인 제목");
});
