import { expect, it } from "vitest";
import {
  demoDisconnectFriend,
  demoGetConnections,
  demoGetDetail,
  demoListFriend,
  demoListSocial,
  demoSendEncouragement,
} from "@/features/tasks/demo-task-store";
it("revokes demo detail, feed, future tasks and cheer writes together", () => {
  expect(demoGetDetail(101).permissions.canEncourage).toBe(true);
  demoDisconnectFriend("demo-friend-1");
  expect(demoGetConnections().friends.some((friend) => friend.id === "demo-friend-1")).toBe(false);
  expect(demoListSocial("demo-friend-1")).toEqual([]);
  expect(demoListFriend("demo-friend-1")).toEqual([]);
  expect(() => demoGetDetail(101)).toThrow(/연결이 해제/);
  expect(() => demoSendEncouragement(101, "clap", "hello")).toThrow(/연결이 해제/);
});
