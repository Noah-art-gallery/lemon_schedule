import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import { DailyFriendCard } from "./daily-friend-card";
import {
  getEncouragementDay,
  saveDailyEncouragement,
  deleteDailyEncouragement,
  type DailyEncouragement,
} from "./daily-encouragement-service";
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ demo: false, user: { id: "sender" } }),
}));
vi.mock("./daily-encouragement-service", () => ({
  getEncouragementDay: vi.fn(),
  saveDailyEncouragement: vi.fn(),
  deleteDailyEncouragement: vi.fn(),
}));
const friend = { id: "owner", displayName: "친구", avatarKey: "lemon" as const };
const sent: DailyEncouragement = {
  id: 3,
  ownerId: "owner",
  authorId: "sender",
  day: "2026-10-13",
  reaction: "clap",
  message: "잘했어",
  quote: null,
  authorName: "나",
  authorAvatarKey: "lemon",
  createdAt: "2026-10-13T01:00:00Z",
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getEncouragementDay).mockResolvedValue({
    day: sent.day,
    owner: friend,
    occurrences: [],
    mine: null,
  });
  vi.mocked(saveDailyEncouragement).mockResolvedValue(sent);
  vi.mocked(deleteDailyEncouragement).mockResolvedValue();
});
async function compose() {
  fireEvent.click(await screen.findByRole("button", { name: "응원 보내기" }));
  fireEvent.click(screen.getByRole("button", { name: "박수" }));
  fireEvent.change(screen.getByLabelText("응원글"), { target: { value: "잘했어" } });
}
it("requires a sticker and leaves a clear saved result after a single in-flight submission", async () => {
  let resolve!: (row: DailyEncouragement) => void;
  vi.mocked(saveDailyEncouragement).mockImplementation(
    () =>
      new Promise((yes) => {
        resolve = yes;
      }),
  );
  render(<DailyFriendCard friend={friend} />);
  fireEvent.click(await screen.findByRole("button", { name: "응원 보내기" }));
  expect(
    within(screen.getByRole("dialog", { name: "응원 보내기" })).getByRole("button", {
      name: "응원 보내기",
    }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "박수" }));
  const form = screen.getByRole("form");
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(saveDailyEncouragement).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("응원을 보냈어요")).not.toBeInTheDocument();
  await act(async () => resolve(sent));
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
  expect(screen.getByText("응원을 보냈어요")).toBeVisible();
  expect(screen.getByLabelText("내가 보낸 응원")).toHaveTextContent("보냄");
  expect(screen.getByLabelText("내가 보낸 응원")).toHaveTextContent("잘했어");
  fireEvent.click(screen.getByRole("button", { name: "수정" }));
  expect(screen.getByLabelText("응원글")).toHaveValue("잘했어");
  expect(screen.getByRole("button", { name: "박수" })).toHaveAttribute("aria-pressed", "true");
});
it("retains the draft on failure and clears it when the recipient day changes", async () => {
  vi.mocked(saveDailyEncouragement).mockRejectedValue(
    new AppError("CONFLICT", "날짜가 바뀌었어요"),
  );
  render(<DailyFriendCard friend={friend} />);
  await compose();
  fireEvent.click(
    within(screen.getByRole("dialog", { name: "응원 보내기" })).getByRole("button", {
      name: "응원 보내기",
    }),
  );
  await screen.findByText("날짜가 바뀌었어요");
  expect(screen.getByLabelText("응원글")).toHaveValue("잘했어");
  vi.mocked(getEncouragementDay).mockResolvedValue({
    day: "2026-10-14",
    owner: friend,
    occurrences: [],
    mine: null,
  });
  fireEvent.click(screen.getByRole("button", { name: "오늘 다시 불러오기" }));
  await screen.findByText("새로운 하루로 바뀌었어요");
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
});
it("requires confirmation before cancelling and returns to one send button", async () => {
  vi.mocked(getEncouragementDay).mockResolvedValue({
    day: sent.day,
    owner: friend,
    occurrences: [],
    mine: sent,
  });
  render(<DailyFriendCard friend={friend} />);
  fireEvent.click(await screen.findByRole("button", { name: "수정" }));
  fireEvent.click(screen.getByRole("button", { name: "응원 취소" }));
  const dialog = screen.getByRole("dialog", { name: "보낸 응원을 취소할까요?" });
  expect(within(dialog).getByRole("button", { name: "취소" })).toHaveFocus();
  fireEvent.click(within(dialog).getByRole("button", { name: "취소" }));
  expect(deleteDailyEncouragement).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "응원 취소" }));
  fireEvent.click(
    within(screen.getByRole("dialog", { name: "보낸 응원을 취소할까요?" })).getByRole("button", {
      name: "응원 취소",
    }),
  );
  await waitFor(() => expect(screen.queryByLabelText("내가 보낸 응원")).not.toBeInTheDocument());
  expect(deleteDailyEncouragement).toHaveBeenCalledWith(3);
  expect(screen.getByText("응원을 취소했어요")).toBeVisible();
  expect(screen.getAllByRole("button", { name: "응원 보내기" })).toHaveLength(1);
});

it("preserves an unsent draft when closing is cancelled", async () => {
  render(<DailyFriendCard friend={friend} />);
  await compose();
  fireEvent.click(screen.getByRole("button", { name: "닫기" }));
  const discard = screen.getByRole("dialog", { name: "작성 중인 응원을 버릴까요?" });
  fireEvent.click(within(discard).getByRole("button", { name: "취소" }));
  expect(screen.getByLabelText("응원글")).toHaveValue("잘했어");
  expect(saveDailyEncouragement).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "닫기" }));
  fireEvent.click(screen.getByRole("button", { name: "버리고 닫기" }));
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
});
