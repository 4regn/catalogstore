// UNIK's live chat "office hours" -- Mon-Fri 9am-6pm, Sat 10am-3pm, closed
// Sunday. SAST is UTC+2 year-round (no DST), same offset trick as
// lib/sast-time.ts: shift the instant forward by the offset, then read its
// UTC day/hour/minute as if they were already SAST wall-clock values.
//
// This same table is duplicated in plain JS inside
// public/private-templates/unik-labs/store.js for the storefront's own chat
// widget, which runs as a static file outside the Next.js bundle and can't
// import this module directly. Keep both in sync if the hours ever change.
const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;

// Sunday = 0 ... Saturday = 6, matching Date#getUTCDay().
const HOURS: Record<number, [number, number] | null> = {
  0: null,
  1: [9, 18],
  2: [9, 18],
  3: [9, 18],
  4: [9, 18],
  5: [9, 18],
  6: [10, 15],
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatHour(h: number): string {
  const period = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${period}`;
}

export type BusinessHoursStatus = { online: boolean; nextOpenLabel: string };

export function unikBusinessHoursStatus(now: Date = new Date()): BusinessHoursStatus {
  const sast = new Date(now.getTime() + SAST_OFFSET_MS);
  const day = sast.getUTCDay();
  const minutesNow = sast.getUTCHours() * 60 + sast.getUTCMinutes();
  const todayRange = HOURS[day];

  if (todayRange && minutesNow >= todayRange[0] * 60 && minutesNow < todayRange[1] * 60) {
    return { online: true, nextOpenLabel: "" };
  }
  if (todayRange && minutesNow < todayRange[0] * 60) {
    return { online: false, nextOpenLabel: `today at ${formatHour(todayRange[0])}` };
  }
  for (let i = 1; i <= 7; i++) {
    const nextDay = (day + i) % 7;
    const range = HOURS[nextDay];
    if (range) {
      const label = i === 1 ? "tomorrow" : DAY_NAMES[nextDay];
      return { online: false, nextOpenLabel: `${label} at ${formatHour(range[0])}` };
    }
  }
  return { online: false, nextOpenLabel: "soon" };
}
