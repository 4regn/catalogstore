// South Africa observes no daylight saving -- SAST is a constant UTC+2 all
// year, so day-boundary math can be plain offset arithmetic instead of
// needing a timezone database. Used to make "today"/"this month" mean the
// seller's actual calendar day, not the UTC day a Vercel serverless
// function happens to be running in.
const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;

// The current date in Africa/Johannesburg, as "YYYY-MM-DD".
export function sastToday(now: Date = new Date()): string {
  return new Date(now.getTime() + SAST_OFFSET_MS).toISOString().slice(0, 10);
}

// The UTC instant that corresponds to 00:00:00 SAST on the given
// "YYYY-MM-DD" date -- i.e. the start of that seller-local day, expressed
// as a real point in time so it can be used directly in a created_at/
// last_seen_at range query.
export function sastDayStartUtc(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00+02:00");
}

export function sastMonthStartUtc(dateStr: string): Date {
  return sastDayStartUtc(dateStr.slice(0, 7) + "-01");
}

// The SAST calendar date ("YYYY-MM-DD") that a given UTC instant (e.g. an
// order's created_at) falls on -- the inverse of sastDayStartUtc, used to
// bucket historical timestamps into the seller's local days rather than
// UTC ones (a sale at 23:30 SAST is already the next UTC day).
export function sastDateOf(iso: string): string {
  return new Date(new Date(iso).getTime() + SAST_OFFSET_MS).toISOString().slice(0, 10);
}
