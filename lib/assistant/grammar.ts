/**
 * Deterministic command grammar for the assistant panel.
 *
 * No LLM, no network. Coverage is exactly what's written here, which is why
 * "I didn't understand that" is a first-class outcome (`ambiguous`) rather than
 * letting unparsed input silently become a note - see NEAR_MISS below.
 *
 * Pure and synchronous: no React, no `window`, safe to import anywhere.
 */

import { addDays, localDateTimeValue } from "@/lib/dates"
import type { Recurrence } from "@/lib/reminders"

export type CommandIntent =
  | "create-reminder"
  | "create-note"
  | "query-reminders"
  | "query-notes"
  | "complete"
  | "delete"
  | "ambiguous"
  | "unknown"

export interface ParsedCommand {
  intent: CommandIntent
  /** The item text, with every matched time phrase removed. Never rewritten. */
  title: string
  /** Local wall-clock `datetime-local` value, matching Reminder.dueAt. */
  dueAt: string | null
  recurrence: Recurrence
  /** True when the time came from a default rather than the user - worth echoing. */
  assumedTime: boolean
  /** For `ambiguous`: the fragment we couldn't read. */
  unparsed?: string
}

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
]

/** Default hour when a day is given with no time. Matches the "Tomorrow 9am" preset. */
const DEFAULT_HOUR = 9

/* -------------------------------------------------------------------------- */
/* Precedence patterns - order of use matters, see parseCommand               */
/* -------------------------------------------------------------------------- */

const NOTE_PREFIX = /^\s*note\s*[:-]\s*/i

/**
 * "Reminder" misspelled as "remainder" is common enough (the two words are one
 * transposed letter apart) that rejecting it would silently mis-file the item
 * as a note instead - see the IMPERATIVE_SHELL entry below for the matching
 * title-stripping half of this.
 */
const REMINDER_WORD = "(?:reminders?|remainders?)"

/**
 * Every phrasing that should be read as "make me a reminder", checked against
 * the raw, untrimmed-of-time text:
 *   - "remind me [to/that/about] ..."
 *   - "please/can you/could you remind me ..."
 *   - "set/add/create/make/new [a/an] reminder ..." (or "remainder")
 *   - "reminder: ..." / "reminder - ..." (or "remainder")
 */
const REMINDER_PREFIX = new RegExp(
  `^\\s*(?:please\\s+)?(?:can you\\s+|could you\\s+)?(?:remind me\\b|(?:set|add|create|make|new)\\s+(?:a\\s+|an\\s+)?${REMINDER_WORD}\\b|${REMINDER_WORD}\\s*[:-])`,
  "i"
)

/**
 * Leading interrogatives, or a trailing "?" with no create prefix. Checked BEFORE
 * the time-expression rule: otherwise "what's on today?" matches `today` and
 * becomes a reminder titled "what's on?".
 */
const INTERROGATIVE =
  /^\s*(?:what|what's|whats|when|which|do i|have i|anything|any\b|show|list|how many)\b/i

const QUERY_NOTES = /\bnotes?\b/i
const COMPLETE_VERB = /^\s*(?:done|did|complete|completed|finish|finished|check off|tick off)\b/i
const DELETE_VERB = /^\s*(?:delete|remove|cancel|drop|forget)\b/i

/**
 * Looks temporal but the strict grammar below didn't match it - "in 2 days",
 * "next month", "at 9.30", "friday morning". Without this the phrase silently
 * becomes part of a note's title and the user gets no signal at all.
 */
const NEAR_MISS =
  /\b(?:in|on|at|by|every|next|this)\s+(?:\d{1,2}(?![\d\-/a-z])|a\s|an\s|mon|tue|wed|thu|fri|sat|sun|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|morning|afternoon|evening|night|week|month|day|hour|min)/i

/**
 * Leading imperative shell, stripped once after the time spans are removed.
 *
 * The trailing whitespace is `\s*`, not `\s+`: after a span is removed, "remind
 * me at 5" leaves the bare string "remind me" with nothing after it, and `\s+`
 * would fail to strip it - leaving "remind me" as the reminder's title. The `\b`
 * is what stops `\s*` from also matching inside "remind meeting".
 */
const IMPERATIVE_SHELL = [
  /^\s*(?:please\s+)?(?:can you\s+|could you\s+)?remind me\b\s*(?:to\s+|that\s+|about\s+)?/i,
  new RegExp(
    `^\\s*(?:please\\s+)?(?:can you\\s+|could you\\s+)?(?:set|add|create|make|new)\\s+(?:a\\s+|an\\s+)?${REMINDER_WORD}\\b\\s*(?:[:-]|to|for|about)?\\s*`,
    "i"
  ),
  new RegExp(`^\\s*${REMINDER_WORD}\\b\\s*(?:[:-]|to|for|about)?\\s*`, "i"),
  /^\s*note\s*[:-]\s*/i,
]

const TRAILING_CONNECTIVE = /\s+(?:at|on|in|by|for|that|to|about|every)\s*$/i
const LEADING_CONNECTIVE = /^\s*(?:that|to|about|at|on)\s+/i

/* -------------------------------------------------------------------------- */
/* Time matching                                                              */
/* -------------------------------------------------------------------------- */

interface Span {
  start: number
  end: number
}

interface TimeOfDay {
  hour: number
  minute: number
  /** False when the hour was bare (no am/pm), so it can be disambiguated later. */
  explicit: boolean
}

/**
 * "at 3pm", "at 09:30", "at 12", "3pm", "midnight", "noon".
 *
 * Rejects a match followed by `-`, `/`, a letter, or `.`+digit, so "at 7-eleven"
 * stays part of the title and "at 9.30" falls through to the near-miss guard
 * rather than being read as 9 o'clock.
 */
function matchTimeOfDay(text: string): { time: TimeOfDay; span: Span } | null {
  const named = /\b(midnight|noon|midday)\b/i.exec(text)
  if (named) {
    const hour = /midnight/i.test(named[1]) ? 0 : 12
    return {
      time: { hour, minute: 0, explicit: true },
      span: { start: named.index, end: named.index + named[0].length },
    }
  }

  // The meridiem's leading \s* is INSIDE the optional group on purpose. With it
  // outside, "at 12 that..." matches "at 12 " including the trailing space, and
  // the glue check below then inspects "th" of the next word and rejects a
  // perfectly good time - so only times at end-of-string survived.
  const pattern = /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?(?:\s*(am|pm))?\b/gi
  for (const match of text.matchAll(pattern)) {
    const [whole, rawHour, rawMinute, meridiem] = match
    const start = match.index
    const end = start + whole.length

    // Reject when glued to something that isn't a time.
    const after = text.slice(end, end + 2)
    if (/^[-/A-Za-z]/.test(after) || /^\.\d/.test(after)) continue

    // A bare number with no "at" and no am/pm is almost certainly not a time
    // ("buy 2 apples"), so require one of the two markers.
    const hasAt = /at\s+$/i.test(text.slice(Math.max(0, start - 4), start + 3))
    if (!meridiem && !rawMinute && !/^at\s/i.test(whole) && !hasAt) continue

    let hour = Number.parseInt(rawHour, 10)
    if (hour > 23) continue
    const minute = rawMinute ? Number.parseInt(rawMinute, 10) : 0
    if (minute > 59) continue

    if (meridiem) {
      const lower = meridiem.toLowerCase()
      if (hour > 12) continue
      hour = lower === "pm" ? (hour % 12) + 12 : hour % 12
      return { time: { hour, minute, explicit: true }, span: { start, end } }
    }

    // 12 with no meridiem means noon. `hour % 12` would give midnight, which is
    // never what "at 12" means.
    if (hour === 12) return { time: { hour: 12, minute, explicit: true }, span: { start, end } }

    return { time: { hour, minute, explicit: false }, span: { start, end } }
  }

  return null
}

interface DayMatch {
  /** Days from today, or a weekday index for "on Monday". */
  kind: "offset" | "weekday"
  value: number
  span: Span
  /** "tonight" implies an evening hour when no time is given. */
  impliedHour?: number
}

/** "today", "tomorrow", "tonight", "on Monday", "next Friday". Longest-first. */
function matchDay(text: string): DayMatch | null {
  const tonight = /\btonight\b/i.exec(text)
  if (tonight) {
    return {
      kind: "offset",
      value: 0,
      impliedHour: 20,
      span: { start: tonight.index, end: tonight.index + tonight[0].length },
    }
  }

  const tomorrow = /\btomorrow\b/i.exec(text)
  if (tomorrow) {
    return {
      kind: "offset",
      value: 1,
      span: { start: tomorrow.index, end: tomorrow.index + tomorrow[0].length },
    }
  }

  const today = /\btoday\b/i.exec(text)
  if (today) {
    return {
      kind: "offset",
      value: 0,
      span: { start: today.index, end: today.index + today[0].length },
    }
  }

  const weekday = new RegExp(`\\b(?:on\\s+|next\\s+|this\\s+)?(${WEEKDAYS.join("|")})\\b`, "i").exec(
    text
  )
  if (weekday) {
    return {
      kind: "weekday",
      value: WEEKDAYS.indexOf(weekday[1].toLowerCase()),
      span: { start: weekday.index, end: weekday.index + weekday[0].length },
    }
  }

  return null
}

/** "in 20 minutes", "in 2 hours". */
function matchRelative(text: string): { ms: number; span: Span } | null {
  const match = /\bin\s+(\d{1,4})\s*(minutes?|mins?|hours?|hrs?)\b/i.exec(text)
  if (!match) return null
  const amount = Number.parseInt(match[1], 10)
  const unit = match[2].toLowerCase()
  const ms = /^h/.test(unit) ? amount * 3_600_000 : amount * 60_000
  return { ms, span: { start: match.index, end: match.index + match[0].length } }
}

/** "every day", "every Monday". Matched before the day tokens so it wins. */
function matchRecurrence(
  text: string
): { recurrence: Exclude<Recurrence, "once">; weekday?: number; span: Span } | null {
  const daily = /\bevery\s*day\b|\bdaily\b/i.exec(text)
  if (daily) {
    return {
      recurrence: "daily",
      span: { start: daily.index, end: daily.index + daily[0].length },
    }
  }

  const weekly = new RegExp(`\\bevery\\s+(${WEEKDAYS.join("|")})\\b`, "i").exec(text)
  if (weekly) {
    return {
      recurrence: "weekly",
      weekday: WEEKDAYS.indexOf(weekly[1].toLowerCase()),
      span: { start: weekly.index, end: weekly.index + weekly[0].length },
    }
  }

  const weeklyBare = /\bevery\s*week\b|\bweekly\b/i.exec(text)
  if (weeklyBare) {
    return {
      recurrence: "weekly",
      span: { start: weeklyBare.index, end: weeklyBare.index + weeklyBare[0].length },
    }
  }

  return null
}

/* -------------------------------------------------------------------------- */
/* Date assembly                                                              */
/* -------------------------------------------------------------------------- */

function atTime(base: Date, hour: number, minute: number): Date {
  const next = new Date(base)
  next.setHours(hour, minute, 0, 0)
  return next
}

/**
 * Resolves a bare hour (no am/pm) to the soonest reading that is still ahead.
 * Said at 19:00, "at 8" means 20:00 tonight, not 08:00 tomorrow.
 */
function resolveBareHour(now: Date, hour: number, minute: number): Date {
  if (hour === 0 || hour > 12) return atTime(now, hour, minute)
  for (const candidate of [atTime(now, hour, minute), atTime(now, (hour % 12) + 12, minute)]) {
    if (candidate.getTime() > now.getTime()) return candidate
  }
  return atTime(addDays(now, 1), hour, minute)
}

/**
 * First occurrence of `weekday` at hour:minute strictly after `now`.
 *
 * `% 7` plus the time comparison, never `if (delta <= 0) delta += 7` - that skips
 * today, so "every Monday at 9" said on Monday 07:00 would wait eight days while
 * still describing itself as "Every Monday at 09:00".
 */
function weekdayAnchor(now: Date, weekday: number, hour: number, minute: number): Date {
  const delta = (weekday - now.getDay() + 7) % 7
  const candidate = atTime(addDays(now, delta), hour, minute)
  return candidate.getTime() <= now.getTime() ? addDays(candidate, 7) : candidate
}

/* -------------------------------------------------------------------------- */
/* Title extraction                                                           */
/* -------------------------------------------------------------------------- */

/** Removes every matched span at once, then peels the imperative shell. */
function extractTitle(text: string, spans: Span[]): string {
  let out = ""
  let cursor = 0
  for (const span of [...spans].sort((a, b) => a.start - b.start)) {
    out += text.slice(cursor, span.start)
    cursor = Math.max(cursor, span.end)
  }
  out += text.slice(cursor)
  out = out.replace(/\s+/g, " ").trim()

  for (const shell of IMPERATIVE_SHELL) {
    if (shell.test(out)) {
      out = out.replace(shell, "")
      break
    }
  }

  // Span removal can leave a dangling connective ("dentist on" <- "dentist on Monday").
  for (let i = 0; i < 2 && TRAILING_CONNECTIVE.test(out); i++) {
    out = out.replace(TRAILING_CONNECTIVE, "")
  }
  out = out.replace(LEADING_CONNECTIVE, "")

  // Deliberately no re-casing and no truncation: a rewritten title is one the
  // user can't verify we understood.
  return out.replace(/\s+/g, " ").trim()
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */

export function parseCommand(raw: string, now: Date = new Date()): ParsedCommand {
  const text = raw.trim()
  const empty: ParsedCommand = {
    intent: "unknown",
    title: "",
    dueAt: null,
    recurrence: "once",
    assumedTime: false,
  }
  if (!text) return empty

  const forcedNote = NOTE_PREFIX.test(text)
  const forcedReminder = REMINDER_PREFIX.test(text)

  // 2. Queries, before any time matching.
  if (!forcedNote && !forcedReminder) {
    const asks = INTERROGATIVE.test(text) || text.endsWith("?")
    if (asks) {
      return {
        ...empty,
        intent: QUERY_NOTES.test(text) ? "query-notes" : "query-reminders",
        title: text,
      }
    }

    // 3. Verbs acting on an existing item.
    if (COMPLETE_VERB.test(text)) {
      return { ...empty, intent: "complete", title: text.replace(COMPLETE_VERB, "").trim() }
    }
    if (DELETE_VERB.test(text)) {
      return { ...empty, intent: "delete", title: text.replace(DELETE_VERB, "").trim() }
    }
  }

  // 4. Time expressions.
  const spans: Span[] = []
  const recurrence = matchRecurrence(text)
  if (recurrence) spans.push(recurrence.span)
  const day = recurrence ? null : matchDay(text)
  if (day) spans.push(day.span)
  const relative = matchRelative(text)
  if (relative) spans.push(relative.span)

  // "at <time>" always supplies the time, so match it after the day token and let
  // it win over any implied hour.
  const timeOfDay = matchTimeOfDay(relative ? text.replace(/\bin\s+\d{1,4}\s*\w+\b/i, " ") : text)
  if (timeOfDay) spans.push(timeOfDay.span)

  // A recurrence plus an absolute day is contradictory ("every day at 9 tomorrow"),
  // but only when the day sits OUTSIDE the recurrence phrase - "every Monday"
  // contains "Monday", so a naive check flags every weekly reminder as a conflict.
  if (recurrence) {
    const otherDay = matchDay(text)
    const insideRecurrence =
      otherDay !== null &&
      otherDay.span.start >= recurrence.span.start &&
      otherDay.span.end <= recurrence.span.end
    if (otherDay && !insideRecurrence) {
      return { ...empty, intent: "ambiguous", title: text, unparsed: text }
    }
  }

  let dueAt: string | null = null
  let assumedTime = false

  if (relative) {
    // Real elapsed milliseconds, so it crosses midnight and stays DST-correct.
    // Never wall-clock setHours arithmetic.
    dueAt = localDateTimeValue(new Date(now.getTime() + relative.ms))
  } else if (recurrence) {
    if (!timeOfDay) {
      // A recurring reminder at a guessed hour is a reminder we're wrong about
      // every single time it fires.
      return { ...empty, intent: "ambiguous", title: text, unparsed: text }
    }
    const { hour, minute } = timeOfDay.time
    const anchor =
      recurrence.weekday !== undefined
        ? weekdayAnchor(now, recurrence.weekday, hour, minute)
        : atTime(now, hour, minute).getTime() > now.getTime()
          ? atTime(now, hour, minute)
          : atTime(addDays(now, 1), hour, minute)
    dueAt = localDateTimeValue(anchor)
  } else if (day) {
    const hour = timeOfDay?.time.hour ?? day.impliedHour ?? DEFAULT_HOUR
    const minute = timeOfDay?.time.minute ?? 0
    assumedTime = !timeOfDay
    const base =
      day.kind === "weekday"
        ? weekdayAnchor(now, day.value, hour, minute)
        : atTime(addDays(now, day.value), hour, minute)
    dueAt = localDateTimeValue(base)
  } else if (timeOfDay) {
    const { hour, minute, explicit } = timeOfDay.time
    const candidate = explicit ? atTime(now, hour, minute) : resolveBareHour(now, hour, minute)
    // Millisecond comparison: an hour-granularity check leaves a dueAt in the
    // past, which buildSchedule drops - we'd confirm a reminder that can't fire.
    dueAt =
      candidate.getTime() <= now.getTime()
        ? localDateTimeValue(addDays(candidate, 1))
        : localDateTimeValue(candidate)
  }

  const title = extractTitle(text, spans)

  if (dueAt || forcedReminder) {
    return {
      intent: "create-reminder",
      title,
      dueAt,
      recurrence: recurrence?.recurrence ?? "once",
      assumedTime,
    }
  }

  // 5. Looks temporal but we couldn't read it - say so rather than quietly
  // folding the phrase into a note title.
  if (!forcedNote && NEAR_MISS.test(text)) {
    return { ...empty, intent: "ambiguous", title, unparsed: text }
  }

  // 6. Everything else is a note.
  return { ...empty, intent: "create-note", title }
}
