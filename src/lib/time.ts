export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("ko-KR", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

export function getDeviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function toDateKey(date: Date, timeZone: string): string {
  if (!isValidTimeZone(timeZone)) {
    throw new RangeError(`유효하지 않은 시간대입니다: ${timeZone}`);
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}
