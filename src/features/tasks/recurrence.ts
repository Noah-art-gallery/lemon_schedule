import type { Recurrence } from "@/types/contracts";

function parseDateKey(value: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new RangeError("날짜는 YYYY-MM-DD 형식이어야 해요.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new RangeError("존재하지 않는 날짜예요.");
  }
  return { year, month, day };
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function buildOccurrenceDates(
  startDate: string,
  recurrence: Recurrence,
  throughDate: string,
): string[] {
  const start = parseDateKey(startDate);
  const through = parseDateKey(throughDate);
  const startUtc = new Date(Date.UTC(start.year, start.month - 1, start.day));
  const throughUtc = new Date(Date.UTC(through.year, through.month - 1, through.day));
  if (throughUtc < startUtc) return [];
  if (recurrence === "none") return [startDate];

  const dates: string[] = [];
  if (recurrence === "monthly") {
    for (let offset = 0; ; offset += 1) {
      const monthIndex = start.month - 1 + offset;
      const year = start.year + Math.floor(monthIndex / 12);
      const normalizedMonth = ((monthIndex % 12) + 12) % 12;
      const day = Math.min(start.day, daysInMonth(year, normalizedMonth));
      const candidate = new Date(Date.UTC(year, normalizedMonth, day));
      if (candidate > throughUtc) break;
      dates.push(dateKey(candidate));
    }
    return dates;
  }

  const step = recurrence === "daily" ? 1 : 7;
  for (let candidate = startUtc; candidate <= throughUtc;) {
    dates.push(dateKey(candidate));
    const next = new Date(candidate);
    next.setUTCDate(next.getUTCDate() + step);
    candidate = next;
  }
  return dates;
}

export function addUtcDays(date: string, days: number): string {
  const parsed = parseDateKey(date);
  const value = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days));
  return dateKey(value);
}
