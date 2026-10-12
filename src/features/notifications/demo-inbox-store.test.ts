import { expect, it, vi } from "vitest";
import * as tasks from "@/features/tasks/demo-task-store";
import { demoListInbox, demoMarkAllInboxRead } from "./demo-inbox-store";
it("uses the task's actual cheer, omits deleted encouragement previews, and only marks ids at the captured boundary", () => {
  expect(
    demoListInbox({ filter: "encouragement" }).items.find((item) => item.id === 3)!,
  ).toMatchObject({
    occurrenceId: 1,
    encouragementId: 11,
    messagePreview: "오늘도 잊지 않고 했네!",
  });
  const detail = tasks.demoGetDetail(1);
  vi.spyOn(tasks, "demoGetDetail").mockReturnValueOnce({ ...detail, encouragements: [] });
  expect(
    demoListInbox({ filter: "encouragement" }).items.find((item) => item.id === 3)!,
  ).toMatchObject({
    availability: "unavailable",
    messagePreview: null,
    reaction: null,
  });
  demoMarkAllInboxRead(2);
  expect(demoListInbox({ filter: "connection" }).items.every((item) => item.readAt)).toBe(true);
  expect(
    demoListInbox({ filter: "encouragement" }).items.find((item) => item.id === 3)!.readAt,
  ).toBeNull();
});
