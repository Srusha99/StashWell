import { addDays, localDateTimeValue, localDayKey, parseLocalDateTime } from "@/lib/dates"
import { readWorkspaceJson, writeWorkspaceJson } from "@/lib/workspace-storage"

export type Recurrence = "once" | "daily" | "weekly"

export interface Reminder {
  id: string
  title: string
  /**
   * Local wall-clock, stored as the raw `<input type="datetime-local">` value
   * ("2026-09-18T14:30"), not epoch ms and not an ISO-Z string.
   *
   * It round-trips losslessly with the input; "6pm" means 6pm wherever the user
   * is, which is the correct model for a reminder; and a date-time form with no
   * Z and no offset is parsed as LOCAL per spec, so comparing against now needs
   * no offset math and stays DST-correct. `toISOString().slice(0, 16)` would
   * shift to UTC and render the wrong hour.
   *
   * For a repeating reminder this is the ANCHOR, not the next occurrence - see
   * nextOccurrence(), which derives the next one instead of mutating this.
   */
  dueAt: string | null
  recurrence: Recurrence
  /** Epoch ms when the user ticked it off, null while open. */
  completedAt: number | null
  createdAt: number
}

const STORAGE_NAME = "reminders"
const MUTED_NAME = "reminders-muted"

function isRecurrence(value: unknown): value is Recurrence {
  return value === "once" || value === "daily" || value === "weekly"
}

function isReminder(value: unknown): value is Reminder {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as Partial<Reminder>
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    (typeof candidate.dueAt === "string" || candidate.dueAt === null) &&
    (typeof candidate.completedAt === "number" || candidate.completedAt === null) &&
    typeof candidate.createdAt === "number"
  )
}

/** Items are validated individually so one corrupt entry can't discard the rest. */
export function readReminders(workspaceId: string): Reminder[] {
  return readWorkspaceJson<Reminder[]>(workspaceId, STORAGE_NAME, [], (parsed) =>
    Array.isArray(parsed)
      ? parsed.filter(isReminder).map((reminder) => ({
          // Reminders written before recurrence existed have no field for it.
          ...reminder,
          recurrence: isRecurrence(reminder.recurrence) ? reminder.recurrence : "once",
        }))
      : null
  )
}

export function writeReminders(workspaceId: string, reminders: Reminder[]): void {
  writeWorkspaceJson(workspaceId, STORAGE_NAME, reminders)
}

/** Per-workspace notification mute, so one workspace can go quiet on its own. */
export function readRemindersMuted(workspaceId: string): boolean {
  return readWorkspaceJson<boolean>(workspaceId, MUTED_NAME, false, (parsed) =>
    typeof parsed === "boolean" ? parsed : null
  )
}

export function writeRemindersMuted(workspaceId: string, muted: boolean): void {
  writeWorkspaceJson(workspaceId, MUTED_NAME, muted)
}

export function createReminder(
  title: string,
  dueAt: string | null,
  recurrence: Recurrence = "once"
): Reminder {
  return {
    id: newReminderId(),
    title,
    dueAt,
    recurrence,
    completedAt: null,
    createdAt: Date.now(),
  }
}

/* -------------------------------------------------------------------------- */
/* Derived state - nothing below mutates a reminder                            */
/* -------------------------------------------------------------------------- */

/**
 * When this reminder next goes off, or null if it has no date.
 *
 * A repeating reminder's stored dueAt is a fixed anchor; the next occurrence is
 * derived here rather than written back. That keeps the page the single source of
 * truth (the notification service worker cannot write localStorage) and means a
 * tab left open overnight can't drift or double-advance.
 *
 * Stepping uses addDays, i.e. the calendar, not 86_400_000ms - a DST day isn't
 * 24 hours, and "every day at 09:00" must stay 09:00 across the change.
 */
export function nextOccurrence(reminder: Reminder, now: Date = new Date()): Date | null {
  const anchor = parseLocalDateTime(reminder.dueAt ?? "")
  if (!anchor) return null
  if (reminder.recurrence === "once") return anchor

  const stepDays = reminder.recurrence === "daily" ? 1 : 7
  let next = new Date(anchor)

  // Jump most of the way in one go, so an anchor years in the past doesn't spin
  // the loop below thousands of times; the loop then settles the remainder.
  const behindMs = now.getTime() - next.getTime()
  if (behindMs > 0) {
    const stepMs = stepDays * 86_400_000
    const wholeSteps = Math.floor(behindMs / stepMs) * stepDays
    if (wholeSteps > 0) next = addDays(next, wholeSteps)
  }
  while (next.getTime() <= now.getTime()) next = addDays(next, stepDays)

  return next
}

/**
 * True once a one-off reminder's time has passed - the "Fired" state.
 *
 * Derived from the clock rather than stored: the service worker that raises the
 * notification runs in a different context with no access to the page's
 * localStorage, so having it write a flag back would need a whole sync channel.
 * Repeating reminders are never "fired" - they roll to their next occurrence.
 */
export function hasFired(reminder: Reminder, now: Date = new Date()): boolean {
  if (reminder.completedAt !== null || reminder.recurrence !== "once") return false
  const due = parseLocalDateTime(reminder.dueAt ?? "")
  return due ? due.getTime() <= now.getTime() : false
}

/** Sort order for the flat list: soonest first, then fired, completed last. */
export function sortedForDisplay(reminders: Reminder[], now: Date = new Date()): Reminder[] {
  return [...reminders].sort((a, b) => {
    const aDone = a.completedAt !== null
    const bDone = b.completedAt !== null
    if (aDone !== bDone) return aDone ? 1 : -1
    if (aDone && bDone) return (b.completedAt ?? 0) - (a.completedAt ?? 0)

    const aNext = nextOccurrence(a, now)
    const bNext = nextOccurrence(b, now)
    // Dateless reminders sink to the bottom of the open items.
    if (!aNext || !bNext) {
      if (aNext === bNext) return a.createdAt - b.createdAt
      return aNext ? -1 : 1
    }
    return aNext.getTime() - bNext.getTime()
  })
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                  */
/* -------------------------------------------------------------------------- */

const TIME: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hour12: false }

function timeOf(date: Date): string {
  return date.toLocaleTimeString("en-GB", TIME)
}

/** "Today · 18:10", "Tomorrow · 01:30", "Jun 3 · 00:10". */
export function formatWhen(date: Date, now: Date = new Date()): string {
  const key = localDayKey(date)
  const time = timeOf(date)

  if (key === localDayKey(now)) return `Today · ${time}`
  if (key === localDayKey(addDays(now, 1))) return `Tomorrow · ${time}`
  if (key === localDayKey(addDays(now, -1))) return `Yesterday · ${time}`

  const day = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  })
  return `${day} · ${time}`
}

/** The line under a reminder's title. */
export function describeReminder(reminder: Reminder, now: Date = new Date()): string {
  if (reminder.completedAt !== null) return "Done"
  if (hasFired(reminder, now)) return "Fired"

  const next = nextOccurrence(reminder, now)
  if (!next) return "No date"

  if (reminder.recurrence === "daily") return `Every day at ${timeOf(next)}`
  if (reminder.recurrence === "weekly") {
    const weekday = next.toLocaleDateString("en-US", { weekday: "long" })
    return `Every ${weekday} at ${timeOf(next)}`
  }
  return formatWhen(next, now)
}

export const RECURRENCE_LABELS: Record<Recurrence, string> = {
  once: "Once",
  daily: "Daily",
  weekly: "Weekly",
}

/* -------------------------------------------------------------------------- */
/* Quick presets                                                               */
/* -------------------------------------------------------------------------- */

export type PresetId = "15min" | "1hr" | "tonight" | "tomorrow9"

export const PRESETS: { id: PresetId; label: string }[] = [
  { id: "15min", label: "In 15 min" },
  { id: "1hr", label: "In 1 hr" },
  { id: "tonight", label: "Tonight" },
  { id: "tomorrow9", label: "Tomorrow 9am" },
]

/** Resolves a preset to a datetime-local value for the composer's field. */
export function presetValue(preset: PresetId, now: Date = new Date()): string {
  const next = new Date(now)

  switch (preset) {
    case "15min":
      next.setMinutes(next.getMinutes() + 15)
      break
    case "1hr":
      next.setHours(next.getHours() + 1)
      break
    case "tonight": {
      next.setHours(20, 0, 0, 0)
      // A reminder in the past is useless, so "Tonight" after 8pm means tomorrow.
      if (next.getTime() <= now.getTime()) return localDateTimeValue(setTime(addDays(now, 1), 20))
      break
    }
    case "tomorrow9":
      return localDateTimeValue(setTime(addDays(now, 1), 9))
  }

  return localDateTimeValue(next)
}

function setTime(date: Date, hour: number): Date {
  const next = new Date(date)
  next.setHours(hour, 0, 0, 0)
  return next
}

function newReminderId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `rem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }
}
