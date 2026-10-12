import { beforeEach, expect, it, vi } from "vitest";
import { encouragementVisibilityValues } from "@/types/contracts";
import { summarySchema } from "./read-contract";

it("rejects owner-hidden responses while preserving author deletion tombstones", () => {
  const summary = {
    count: 0,
    reactions: { lemon: 0, clap: 0, heart: 0, cheer: 0 },
    latestMessage: null,
    myEncouragement: { id: 1, reaction: null, message: "응원", visibility: "hidden_by_owner" },
  };
  expect(summarySchema.safeParse(summary).success).toBe(false);
  expect(encouragementVisibilityValues).toEqual(["visible", "deleted_by_author"]);
  summary.myEncouragement.visibility = "deleted_by_author";
  expect(summarySchema.safeParse(summary).success).toBe(true);
});

beforeEach(() => vi.resetModules());
it("keeps author deletion and explicit rewrite while refusing owner deletion", async () => {
  const store = await import("./demo-task-store");
  expect(() => store.demoDeleteEncouragement(11)).toThrow("직접 보낸 응원만 삭제");
  expect(store.demoGetDetail(1).summary.count).toBe(1);
  store.demoSendEncouragement(101, "heart", "보존할 글");
  const sent = store.demoGetDetail(101).summary.myEncouragement!;
  store.demoSendEncouragement(101, "clap", sent.message!);
  expect(store.demoGetDetail(101).summary.myEncouragement).toMatchObject({
    id: sent.id,
    message: "보존할 글",
    reaction: "clap",
  });
  store.demoDeleteEncouragement(sent.id);
  expect(store.demoGetDetail(101).summary.myEncouragement).toBeNull();
  store.demoSendEncouragement(101, "cheer", "다시 작성");
  expect(store.demoGetDetail(101).summary.myEncouragement).toMatchObject({
    id: sent.id,
    visibility: "visible",
  });
  expect(() => store.demoSendEncouragement(101, null, " ")).toThrow();
  expect(() => store.demoSendEncouragement(101, null, "가".repeat(121))).toThrow();
});
