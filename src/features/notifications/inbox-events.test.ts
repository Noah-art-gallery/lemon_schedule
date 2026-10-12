import { expect, it } from "vitest";
import { isDirectInboxEvent } from "./inbox-events";
it("only counts direct event types as inbox subscription events", () => {
  expect(isDirectInboxEvent("task_completed")).toBe(false);
  expect(isDirectInboxEvent("encouragement_received")).toBe(true);
  expect(isDirectInboxEvent("connection_request")).toBe(true);
  expect(isDirectInboxEvent("connection_accepted")).toBe(true);
});
