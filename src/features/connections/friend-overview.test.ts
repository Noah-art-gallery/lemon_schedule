import { describe, expect, it } from "vitest";

import type { TaskOccurrenceRow } from "@/lib/supabase/database.types";
import { friendWindow, groupFriendOccurrences } from "./friend-overview";

function occurrence(id: number, date: string, status: "pending" | "completed"): TaskOccurrenceRow {
  return {
    id,
    task_id: id,
    owner_id: "friend",
    occurrence_date: date,
    title_snapshot: `할 일 ${id}`,
    due_time: null,
    recurrence_snapshot: "none",
    status,
    completed_at: status === "completed" ? "2026-10-01T00:00:00Z" : null,
    first_completed_at: null,
    reopened_at: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  };
}

describe("친구 발생 건 분류", () => {
  it("지난 기록과 먼 미래를 겹침 없이 한 구간씩 확장한다", () => {
    expect(friendWindow("2026-10-01", "past", 1)).toEqual({
      from: "2024-09-29",
      to: "2025-09-29",
    });
    expect(friendWindow("2026-10-01", "future", 1)).toEqual({
      from: "2027-10-03",
      to: "2028-10-02",
    });
  });
  it("오늘을 먼저 보여 주고 밀린 일과 완료 기록을 구분한다", () => {
    const groups = groupFriendOccurrences(
      [
        occurrence(1, "2026-09-01", "completed"),
        occurrence(2, "2026-09-30", "pending"),
        occurrence(3, "2026-10-02", "pending"),
        occurrence(4, "2026-10-01", "completed"),
        occurrence(5, "2026-09-29", "pending"),
      ],
      "2026-10-01",
    );
    expect(groups.todayItems.map((item) => item.id)).toEqual([4]);
    expect(groups.overdue.map((item) => item.id)).toEqual([2, 5]);
    expect(groups.upcoming.map((item) => item.id)).toEqual([3]);
    expect(groups.completedPast.map((item) => item.id)).toEqual([1]);
  });
});
