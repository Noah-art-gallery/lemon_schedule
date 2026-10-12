import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { OccurrenceDetailPanel } from "./occurrence-detail-panel";
import { getOccurrenceDetail, completeOccurrence } from "./task-service";
import { demoGetDetail } from "./demo-task-store";
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ demo: false, user: { id: "demo" } }),
}));
vi.mock("./task-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./task-service")>()),
  getOccurrenceDetail: vi.fn(),
  completeOccurrence: vi.fn(),
}));
afterEach(() => {
  vi.clearAllMocks();
});
it("ignores an older target response and only resolves the current detail", async () => {
  let resolveFirst!: (value: ReturnType<typeof demoGetDetail>) => void;
  const first = new Promise<ReturnType<typeof demoGetDetail>>((resolve) => {
    resolveFirst = resolve;
  });
  vi.mocked(getOccurrenceDetail).mockImplementation(({ occurrenceId }) =>
    occurrenceId === 1 ? first : Promise.resolve(demoGetDetail(2)),
  );
  const resolved = vi.fn();
  const close = vi.fn();
  const view = render(
    <OccurrenceDetailPanel occurrenceId={1} onClose={close} onResolved={resolved} />,
  );
  await waitFor(() => expect(getOccurrenceDetail).toHaveBeenCalledWith({ occurrenceId: 1 }));
  view.rerender(<OccurrenceDetailPanel occurrenceId={2} onClose={close} onResolved={resolved} />);
  await screen.findByRole("heading", { name: "영어 단어 10개" });
  await act(async () => resolveFirst(demoGetDetail(1)));
  expect(screen.queryByRole("heading", { name: "물 2잔 마시기" })).not.toBeInTheDocument();
  expect(resolved).toHaveBeenCalledTimes(1);
  expect(resolved.mock.calls[0][0].occurrence.id).toBe(2);
});
it("locks completion while the request is pending and retains the prior status on failure", async () => {
  vi.mocked(getOccurrenceDetail).mockResolvedValue(demoGetDetail(2));
  let reject!: (error: Error) => void;
  vi.mocked(completeOccurrence).mockImplementation(
    () =>
      new Promise((_, no) => {
        reject = no;
      }),
  );
  render(<OccurrenceDetailPanel occurrenceId={2} onClose={() => {}} />);
  const button = await screen.findByRole("button", { name: "완료하기" });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(completeOccurrence).toHaveBeenCalledTimes(1);
  await act(async () => reject(new Error("다시 시도해 주세요")));
  await screen.findByRole("alert");
  expect(screen.getByText("진행 중")).toBeInTheDocument();
  expect(button).not.toBeDisabled();
});
