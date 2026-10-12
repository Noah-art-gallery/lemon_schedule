import { expect, it } from "vitest";
import { needsOlderActivity } from "./activity-boundary";
it("keeps fetching within a shared completion timestamp until the previous occurrence ID", () => {
  const boundary = { firstCompletedAt: "2026-10-12T00:00:00.123456Z", occurrenceId: 99 };
  expect(needsOlderActivity({ ...boundary, occurrenceId: 101 }, boundary)).toBe(true);
  expect(needsOlderActivity({ ...boundary, occurrenceId: 99 }, boundary)).toBe(false);
  expect(needsOlderActivity({ ...boundary, occurrenceId: 98 }, boundary)).toBe(false);
});
it("compares completion times before IDs with microsecond and offset precision", () => {
  const boundary = { firstCompletedAt: "2026-10-12T00:00:00.123456Z", occurrenceId: 99 };
  expect(
    needsOlderActivity(
      { firstCompletedAt: "2026-10-12T00:00:00.123457Z", occurrenceId: 1 },
      boundary,
    ),
  ).toBe(true);
  expect(
    needsOlderActivity(
      { firstCompletedAt: "2026-10-12T00:00:00.123455Z", occurrenceId: 1000 },
      boundary,
    ),
  ).toBe(false);
  expect(
    needsOlderActivity(
      { firstCompletedAt: "2026-10-12T09:00:00.123456+09:00", occurrenceId: 99 },
      boundary,
    ),
  ).toBe(false);
});
