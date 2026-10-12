import { afterEach, expect, it, vi } from "vitest";

import { getSupabaseClient } from "@/lib/supabase/client";
import type { TaskOccurrenceRow } from "@/lib/supabase/database.types";
import { listOccurrences, listOccurrenceWindow } from "./task-service";

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

it("splits an explicitly expanded multi-year window without dropping its final day", async () => {
  const range = vi.fn().mockResolvedValue({ data: [], error: null });
  const rpc = vi.fn((name: string) =>
    name === "get_owner_today" ? Promise.resolve({ data: "2026-10-12", error: null }) : { range },
  );
  vi.mocked(getSupabaseClient).mockReturnValue({ rpc } as unknown as ReturnType<
    typeof getSupabaseClient
  >);
  await listOccurrenceWindow({ ownerId: "owner-id", from: "2026-01-01", to: "2031-01-01" });
  const windows = rpc.mock.calls.filter(([name]) => name === "list_task_occurrences");
  expect(windows).toHaveLength(3);
  expect(windows.at(-1)).toEqual([
    "list_task_occurrences",
    expect.objectContaining({ range_to: "2031-01-01" }),
  ]);
});
