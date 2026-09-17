import { describe, expect, it } from "vitest";
import { isValidTimeZone, toDateKey } from "./time";

describe("시간대 도우미", () => {
  it("IANA 시간대를 검증한다", () => {
    expect(isValidTimeZone("Asia/Seoul")).toBe(true);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
  });

  it("사용자 시간대의 달력 날짜를 만든다", () => {
    const instant = new Date("2026-09-17T16:30:00.000Z");
    expect(toDateKey(instant, "Asia/Seoul")).toBe("2026-09-18");
    expect(toDateKey(instant, "America/Los_Angeles")).toBe("2026-09-17");
  });
});
