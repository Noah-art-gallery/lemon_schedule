import { expect, it } from "vitest";
import { demoHideEncouragement } from "@/features/tasks/demo-task-store";
import { demoListInbox, demoMarkAllInboxRead } from "./demo-inbox-store";
it("uses the task's actual cheer, strips hidden previews, and only marks ids at the captured boundary", () => {
  expect(demoListInbox({ filter: "encouragement" }).items[0]).toMatchObject({
    occurrenceId: 1,
    encouragementId: 11,
    messagePreview: "오늘도 잊지 않고 했네!",
  });
  demoHideEncouragement(11, true);
  expect(demoListInbox({ filter: "encouragement" }).items[0]).toMatchObject({
    availability: "available",
    messagePreview: null,
    reaction: null,
  });
  demoHideEncouragement(11, false);
  demoMarkAllInboxRead(2);
  expect(demoListInbox({ filter: "connection" }).items.every((item) => item.readAt)).toBe(true);
  expect(demoListInbox({ filter: "encouragement" }).items[0].readAt).toBeNull();
});
