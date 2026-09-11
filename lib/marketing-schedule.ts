// datetime-local values are always interpreted in South African time,
// regardless of the browser's or server's timezone.
export function parseMarketingSchedule(value: unknown, now = Date.now()) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new Error("Choose a valid date and time in South African time.");
  }
  const instant = Date.parse(`${value}:00+02:00`);
  if (!Number.isFinite(instant) || new Date(instant + 7200000).toISOString().slice(0, 16) !== value) {
    throw new Error("Choose a valid date and time.");
  }
  if (instant <= now + 60000) throw new Error("Schedule at least one minute in the future.");
  return new Date(instant).toISOString();
}

export function todayAtNineSast(now = Date.now()) {
  return `${new Date(now + 7200000).toISOString().slice(0, 10)}T09:00`;
}

export function formatMarketingSchedule(value: string) {
  return new Date(value).toLocaleString("en-ZA", {
    timeZone: "Africa/Johannesburg", day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }) + " SAST";
}
