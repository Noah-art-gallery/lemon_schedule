import type { TaskOccurrenceRow } from "@/lib/supabase/database.types";
import { addUtcDays } from "@/features/tasks/recurrence";

export function friendWindow(today: string, direction: "past" | "future", page: number) {
  return {
    from: addUtcDays(today, direction === "past" ? -366 * (page + 1) : 366 * page + 1),
    to: addUtcDays(today, direction === "past" ? -366 * page - 1 : 366 * (page + 1)),
  };
}

export function groupFriendOccurrences(occurrences: TaskOccurrenceRow[], today: string) {
  const todayItems: TaskOccurrenceRow[] = [];
  const overdue: TaskOccurrenceRow[] = [];
  const upcoming: TaskOccurrenceRow[] = [];
  const completedPast: TaskOccurrenceRow[] = [];

  for (const item of occurrences) {
    if (item.occurrence_date === today) todayItems.push(item);
    else if (item.occurrence_date > today) upcoming.push(item);
    else if (item.status === "pending") overdue.push(item);
    else completedPast.push(item);
  }

  todayItems.sort((a, b) => a.id - b.id);
  overdue.sort((a, b) => b.occurrence_date.localeCompare(a.occurrence_date) || b.id - a.id);
  upcoming.sort((a, b) => a.occurrence_date.localeCompare(b.occurrence_date) || a.id - b.id);
  completedPast.sort((a, b) => b.occurrence_date.localeCompare(a.occurrence_date) || b.id - a.id);

  return { todayItems, overdue, upcoming, completedPast };
}
