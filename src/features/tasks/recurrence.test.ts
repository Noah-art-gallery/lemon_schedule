import { describe, expect, it } from "vitest";

import { buildOccurrenceDates } from "./recurrence";

describe("buildOccurrenceDates", () => {
  it("keeps missed daily and weekly dates as independent occurrences", () => {
    expect(buildOccurrenceDates("2026-09-17", "daily", "2026-09-20")).toEqual([
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
    ]);
    expect(buildOccurrenceDates("2026-09-17", "weekly", "2026-10-02")).toEqual([
      "2026-09-17",
      "2026-09-24",
      "2026-10-01",
    ]);
  });

  it("uses the last day when a monthly anchor day does not exist", () => {
    expect(buildOccurrenceDates("2026-01-31", "monthly", "2026-04-30")).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("keeps a one-off task even when the generation horizon is later", () => {
    expect(buildOccurrenceDates("2026-09-17", "none", "2027-09-17")).toEqual(["2026-09-17"]);
  });

  it("keeps the original monthly anchor across leap years and long ranges", () => {
    const dates = buildOccurrenceDates("2020-01-31", "monthly", "2024-03-31");
    expect(dates).toContain("2020-02-29");
    expect(dates).toContain("2024-02-29");
    expect(dates.at(-1)).toBe("2024-03-31");
  });
});
