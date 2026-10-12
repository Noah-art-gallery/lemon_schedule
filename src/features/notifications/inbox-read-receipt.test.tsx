import { Panel } from "@/components/ui/panel";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { InboxReadReceipt } from "./inbox-read-receipt";
import { listInbox, markNotificationRead } from "./notification-service";
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ demo: false, user: { id: "user" } }),
}));
vi.mock("./notification-service", () => ({ listInbox: vi.fn(), markNotificationRead: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listInbox).mockResolvedValue({
    items: [{ id: 9, target: "/friends/?request=41", availability: "available" } as never],
    nextCursor: null,
  });
  vi.mocked(markNotificationRead).mockResolvedValue(true);
});
it("waits for the exact target to resolve before marking read", async () => {
  const view = render(
    <InboxReadReceipt notificationId={9} target={{ kind: "request", id: "41" }} resolved={false} />,
  );
  expect(markNotificationRead).not.toHaveBeenCalled();
  view.rerender(
    <InboxReadReceipt notificationId={9} target={{ kind: "request", id: "41" }} resolved />,
  );
  await waitFor(() => expect(markNotificationRead).toHaveBeenCalledWith(9));
});
it("keeps failed reads retryable without replacing resolved content", async () => {
  vi.mocked(markNotificationRead).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  render(<InboxReadReceipt notificationId={9} target={{ kind: "request", id: "41" }} resolved />);
  fireEvent.click(await screen.findByRole("button", { name: "읽음 처리 다시 시도" }));
  await waitFor(() => expect(markNotificationRead).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByRole("button")).not.toBeInTheDocument());
});
it("does not mark a stale or mismatched target read", async () => {
  render(<InboxReadReceipt notificationId={9} target={{ kind: "friend", id: "other" }} resolved />);
  await screen.findByRole("button", { name: "읽음 처리 다시 시도" });
  expect(markNotificationRead).not.toHaveBeenCalled();
});
it("cancels the read if resolution becomes stale while validating the target", async () => {
  let finish!: (value: Awaited<ReturnType<typeof listInbox>>) => void;
  vi.mocked(listInbox).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(
    <InboxReadReceipt notificationId={9} target={{ kind: "request", id: "41" }} resolved />,
  );
  await waitFor(() => expect(listInbox).toHaveBeenCalled());
  view.rerender(
    <InboxReadReceipt notificationId={9} target={{ kind: "request", id: "41" }} resolved={false} />,
  );
  await act(async () =>
    finish({
      items: [{ id: 9, target: "/friends/?request=41", availability: "available" } as never],
      nextCursor: null,
    }),
  );
  expect(markNotificationRead).not.toHaveBeenCalled();
});
it("keeps the failed-read retry within the active dialog focus scope", async () => {
  vi.mocked(markNotificationRead).mockResolvedValue(false);
  render(
    <>
      <main>소식 목록</main>
      <Panel open title="할 일 상세" onClose={() => {}}>
        <InboxReadReceipt notificationId={9} target={{ kind: "request", id: "41" }} resolved />
      </Panel>
    </>,
  );
  const retry = await screen.findByRole("button", { name: "읽음 처리 다시 시도" });
  expect(retry.closest('[role="dialog"]')).not.toBeNull();
  expect(retry.closest("[inert]")).toBeNull();
  expect(retry).toBeVisible();
});
