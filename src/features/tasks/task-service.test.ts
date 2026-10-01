import { afterEach, expect, it, vi } from "vitest";

import { getSupabaseClient } from "@/lib/supabase/client";
import type { TaskOccurrenceRow } from "@/lib/supabase/database.types";
import { listOccurrences } from "./task-service";

vi.mock("@/lib/supabase/client", () => ({ getSupabaseClient: vi.fn() }));

afterEach(() => vi.clearAllMocks());

it("reads every occurrence page before calculating today's progress", async () => {
  const oldRow = { occurrence_date: "2026-09-30", status: "pending" } as TaskOccurrenceRow;
  const firstPage = Array.from({ length: 1000 }, () => oldRow);
  const secondPage = [
    { occurrence_date: "2026-10-01", status: "completed" },
    { occurrence_date: "2026-10-01", status: "pending" },
  ] as TaskOccurrenceRow[];
  const range = vi
    .fn()
    .mockResolvedValueOnce({ data: firstPage, error: null })
    .mockResolvedValueOnce({ data: secondPage, error: null });
  const rpc = vi.fn((name: string) =>
    name === "get_owner_today" ? Promise.resolve({ data: "2026-10-01", error: null }) : { range },
  );
  vi.mocked(getSupabaseClient).mockReturnValue({ rpc } as unknown as ReturnType<
    typeof getSupabaseClient
  >);

  const result = await listOccurrences({
    ownerId: "owner-id",
    from: "2025-10-01",
    to: "2027-10-01",
  });

  expect(range.mock.calls).toEqual([
    [0, 999],
    [1000, 1999],
  ]);
  expect(result.occurrences).toHaveLength(1002);
  expect(result.todaySummary).toEqual({
    scheduledCount: 2,
    completedCount: 1,
    percent: 50,
    empty: false,
  });
});
