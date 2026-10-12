import type { CompletionCursor, SocialActivityItem } from "@/types/contracts";

export function activityBoundary(items: SocialActivityItem[]): CompletionCursor | null {
  const last = items.at(-1)?.occurrence;
  return last?.first_completed_at
    ? { firstCompletedAt: last.first_completed_at, occurrenceId: last.id }
    : null;
}

// PostgreSQL timestamps retain microseconds, including when the millisecond part is equal.
function timestampMicros(value: string): bigint {
  const fraction = (value.match(/\.(\d+)/)?.[1] ?? "").padEnd(6, "0");
  return BigInt(Date.parse(value)) * 1000n + BigInt(fraction.slice(3, 6));
}

/** Descending keyset pages must reach the old tail, even if newer rows were inserted. */
export function needsOlderActivity(cursor: CompletionCursor, boundary: CompletionCursor | null) {
  if (!boundary) return false;
  const cursorTime = timestampMicros(cursor.firstCompletedAt);
  const boundaryTime = timestampMicros(boundary.firstCompletedAt);
  return (
    cursorTime > boundaryTime ||
    (cursorTime === boundaryTime && cursor.occurrenceId > boundary.occurrenceId)
  );
}
