/**
 * Local calendar day as YYYY-MM-DD. Built from local getters rather than
 * toISOString(), which converts to UTC and would roll the day over at the
 * wrong moment for anyone not on UTC.
 *
 * Lives here rather than in a hook module so pure `lib/` code (kanban due-date
 * bucketing) can use it without importing a "use client" file.
 */
export function localDayKey(date: Date = new Date()): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * Formats a Date as the value shape an `<input type="datetime-local">` wants:
 * YYYY-MM-DDTHH:mm in local wall-clock time. Deliberately not
 * toISOString().slice(0, 16), which shifts to UTC and shows the wrong hour.
 */
export function localDateTimeValue(date: Date): string {
  const hours = `${date.getHours()}`.padStart(2, "0")
  const minutes = `${date.getMinutes()}`.padStart(2, "0")
  return `${localDayKey(date)}T${hours}:${minutes}`
}

/**
 * Parses a `datetime-local` value ("2026-09-18T14:30") as local wall-clock
 * time. A date-time form with no trailing Z and no offset is local per spec,
 * so this needs no manual offset math. Returns null for anything unparseable.
 */
export function parseLocalDateTime(value: string): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/

/** True for a bare "YYYY-MM-DD" due date with no time component (all-day). */
export function isDateOnly(value: string): boolean {
  return DATE_ONLY_RE.test(value)
}

/**
 * Parses a due-date value that may be either a `datetime-local` string or a
 * bare "YYYY-MM-DD" all-day date. The all-day case is built from local Y/M/D
 * parts rather than `new Date("YYYY-MM-DD")`, which parses as UTC midnight
 * and can land on the wrong calendar day once read back with local getters.
 */
export function parseDueAt(value: string): Date | null {
  if (!value) return null
  if (isDateOnly(value)) {
    const [year, month, day] = value.split("-").map(Number)
    return new Date(year, month - 1, day)
  }
  return parseLocalDateTime(value)
}

/** Adds whole days via the calendar, not 86_400_000ms - DST days aren't 24h. */
export function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export type Meridiem = "AM" | "PM"

/** Splits a Date into the 12-hour parts a clock UI needs. */
export function splitLocalTime(date: Date): {
  hours: string
  minutes: string
  meridiem: Meridiem
} {
  const raw = date.getHours()
  // 0 and 12 both display as 12 on a 12-hour clock: midnight is 12 AM, noon 12 PM.
  const hours12 = raw % 12 === 0 ? 12 : raw % 12
  return {
    hours: `${hours12}`.padStart(2, "0"),
    minutes: `${date.getMinutes()}`.padStart(2, "0"),
    meridiem: raw < 12 ? "AM" : "PM",
  }
}

/** Splits a Date into the 24-hour parts a clock UI needs - no meridiem. */
export function splitLocalTime24(date: Date): { hours: string; minutes: string } {
  return {
    hours: `${date.getHours()}`.padStart(2, "0"),
    minutes: `${date.getMinutes()}`.padStart(2, "0"),
  }
}

/** The 24-hour hour for a 12-hour clock reading. 12 AM -> 0, 12 PM -> 12. */
export function to24Hour(hours12: number, meridiem: Meridiem): number {
  const base = hours12 % 12
  return meridiem === "PM" ? base + 12 : base
}

/**
 * Builds a `datetime-local` value from calendar and 12-hour clock parts.
 *
 * `day` is clamped to the month's length so switching from the 31st to a shorter
 * month can't roll into the next one - `new Date(2026, 1, 31)` is silently March 3.
 */
export function composeLocalDateTime(
  year: number,
  month: number,
  day: number,
  hours12: number,
  minutes: number,
  meridiem: Meridiem
): string {
  const clampedDay = Math.min(day, daysInMonth(year, month))
  const date = new Date(year, month, clampedDay, to24Hour(hours12, meridiem), minutes, 0, 0)
  return localDateTimeValue(date)
}

/**
 * Builds a `datetime-local` value from calendar and 24-hour clock parts - the
 * 24-hour counterpart to composeLocalDateTime, with no meridiem and no
 * hour-0 coercion (0 is a valid, distinct hour - midnight - in this mode).
 */
export function composeLocalDateTime24(
  year: number,
  month: number,
  day: number,
  hours24: number,
  minutes: number
): string {
  const clampedDay = Math.min(day, daysInMonth(year, month))
  const date = new Date(year, month, clampedDay, hours24, minutes, 0, 0)
  return localDateTimeValue(date)
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

/** Weekday index (0 = Sunday) that the month's first day falls on. */
export function firstWeekdayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}

const TIME_24H: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hour12: false }
const TIME_12H: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit", hour12: true }

/** "18:10" or "6:10 PM" - see hooks/use-appearance-settings.ts's use24HourClock. */
function timeOf(date: Date, use24Hour: boolean): string {
  return use24Hour
    ? date.toLocaleTimeString("en-GB", TIME_24H)
    : date.toLocaleTimeString("en-US", TIME_12H)
}

/**
 * "Today · 18:10", "Tomorrow · 1:30 AM", "Jun 3 · 12:10 AM" - or, for an
 * all-day due date, the same labels with no time suffix ("Today", "Jun 3").
 */
export function formatWhen(date: Date, now: Date = new Date(), use24Hour = false, allDay = false): string {
  const key = localDayKey(date)
  const suffix = allDay ? "" : ` · ${timeOf(date, use24Hour)}`

  if (key === localDayKey(now)) return `Today${suffix}`
  if (key === localDayKey(addDays(now, 1))) return `Tomorrow${suffix}`
  if (key === localDayKey(addDays(now, -1))) return `Yesterday${suffix}`

  const day = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  })
  return `${day}${suffix}`
}
