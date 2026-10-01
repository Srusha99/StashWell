import type { KanbanCard } from "@/lib/kanban"
import { localDateTimeValue, localDayKey, parseLocalDateTime } from "@/lib/dates"

const CALENDAR_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
const REVOKE_URL = "https://oauth2.googleapis.com/revoke"
const SYNC_ENABLED_KEY = "bm:gcal-sync-enabled"

export interface CalendarEventResult {
  id: string
  htmlLink: string
}

export function hasIdentityApi(): boolean {
  return typeof chrome !== "undefined" && !!chrome.identity
}

/* -------------------------------------------------------------------------- */
/* Connection                                                                  */
/* -------------------------------------------------------------------------- */

/** The stored toggle, readable synchronously for a first render; null if never set. */
export function readCalendarSyncFlag(): boolean | null {
  try {
    const raw = window.localStorage.getItem(SYNC_ENABLED_KEY)
    return raw === null ? null : raw === "true"
  } catch {
    return null
  }
}

function writeSyncFlag(enabled: boolean): void {
  try {
    window.localStorage.setItem(SYNC_ENABLED_KEY, String(enabled))
  } catch {
    // ignore write failures (storage disabled, quota exceeded)
  }
}

/** A Calendar token only if Chrome can get one without showing any UI. */
function getSilentCalendarToken(): Promise<string | null> {
  if (!hasIdentityApi()) return Promise.resolve(null)
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      resolve(chrome.runtime.lastError || !token ? null : token)
    })
  })
}

/** Whether Google currently grants Calendar access - the badge, not the toggle. */
export async function hasCalendarAccess(): Promise<boolean> {
  return (await getSilentCalendarToken()) !== null
}

/**
 * The Integrations toggle, and what every sync call is gated on. Never inferred
 * from "can we get a token": that stays true for as long as Google holds the
 * grant, whatever the user chose here.
 *
 * Before the toggle existed, sync was on for anyone who had granted access, so
 * a missing flag is settled once from that and then stored.
 */
export async function isCalendarSyncEnabled(): Promise<boolean> {
  const stored = readCalendarSyncFlag()
  if (stored !== null) return stored
  if (!hasIdentityApi()) return false

  const enabled = await hasCalendarAccess()
  writeSyncFlag(enabled)
  return enabled
}

// Revokes queue here so a reconnect can wait them out - a revoke still in
// flight when the new grant lands would take that grant down with it.
let pendingRevoke: Promise<void> = Promise.resolve()

/** Turns sync on, showing Google's consent screen if access isn't granted yet. */
export async function connectCalendar(): Promise<{ error: string | null }> {
  await pendingRevoke
  try {
    await getCalendarAuthToken()
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn't connect Google Calendar." }
  }
  writeSyncFlag(true)
  return { error: null }
}

/**
 * Turns sync off and revokes the grant. removeCachedAuthToken on its own only
 * drops Chrome's local copy - Google still holds the grant, so the next silent
 * getAuthToken mints a fresh token and the pane reads "Connected" again on
 * reload. The flag goes off synchronously, before any await, so sync stops the
 * moment this is called and callers needn't wait on the network round trip.
 */
export function disconnectCalendar(): Promise<void> {
  writeSyncFlag(false)
  pendingRevoke = pendingRevoke.then(revokeCalendarGrant)
  return pendingRevoke
}

/** Never rejects: it runs on the revoke queue, which connectCalendar awaits. */
async function revokeCalendarGrant(): Promise<void> {
  const token = await getSilentCalendarToken()
  if (!token) return

  try {
    // Revokes this extension's OAuth client only - the Supabase sign-in in
    // lib/googleAuth.ts is a separate client and stays signed in.
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    })
  } catch {
    // Offline or blocked: the flag is already off, which is what stops sync.
  }
  await new Promise<void>((resolve) => chrome.identity.removeCachedAuthToken({ token }, resolve))
}

/* -------------------------------------------------------------------------- */
/* Events                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Requests a Calendar-scoped access token through the extension's own
 * OAuth2 client (manifest.json's oauth2 block), separate from the Supabase
 * Google sign-in in lib/googleAuth.ts, which never asks for the
 * calendar.events scope.
 */
function getCalendarAuthToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(new Error(chrome.runtime.lastError?.message ?? "Google Calendar sign-in was cancelled."))
        return
      }
      resolve(token)
    })
  })
}

function nextDay(dateOnly: string): string {
  const [year, month, day] = dateOnly.split("-").map(Number)
  return localDayKey(new Date(year, month - 1, day + 1))
}

/**
 * Google Calendar's events.insert wants either `{ date }` (all-day, with an
 * *exclusive* end - a single-day event needs its end one day after its
 * start, or the API rejects it as an empty range) or `{ dateTime, timeZone
 * }`. dueAt carries no UTC offset (it's local wall-clock - see
 * lib/dates.ts), so timeZone is sent alongside it rather than converting to
 * a "Z" instant.
 */
function buildEventTimes(dueAt: string | undefined): {
  start: Record<string, string>
  end: Record<string, string>
} {
  if (!dueAt || !dueAt.includes("T")) {
    const date = dueAt || localDayKey(new Date())
    return { start: { date }, end: { date: nextDay(date) } }
  }

  const parsed = parseLocalDateTime(dueAt)
  if (!parsed) throw new Error(`Invalid dueAt value: ${dueAt}`)

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const dateTime = `${localDateTimeValue(parsed)}:00`
  return {
    start: { dateTime, timeZone },
    end: { dateTime, timeZone },
  }
}

/**
 * Shared request/response shape for create, update and delete: builds the
 * summary/description/start/end body Google's events API expects from a
 * kanban card.
 */
function buildEventPayload(task: KanbanCard) {
  return {
    summary: task.title,
    description: task.description,
    ...buildEventTimes(task.dueAt),
  }
}

/**
 * Authenticates and issues one request against the events collection (or a
 * single event under it, via `path`), so create/update/delete share the
 * same token fetch and header setup instead of each redoing it.
 */
async function calendarFetch(path: string, init: RequestInit): Promise<Response> {
  const token = await getCalendarAuthToken()
  return fetch(`${CALENDAR_EVENTS_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  })
}

/**
 * Creates a Google Calendar event for a kanban card. Always makes the API
 * call, even with no dueAt at all - an undated card becomes an all-day
 * event for today rather than being skipped.
 */
export async function createCalendarEvent(task: KanbanCard): Promise<CalendarEventResult> {
  const response = await calendarFetch("", {
    method: "POST",
    body: JSON.stringify(buildEventPayload(task)),
  })

  if (!response.ok) {
    throw new Error(`Google Calendar API error (${response.status}): ${await response.text()}`)
  }

  return response.json()
}

// PATCH does a partial update in place so editing a card's date/title moves the same event instead of creating a second one.
export async function updateCalendarEvent(eventId: string, task: KanbanCard): Promise<CalendarEventResult> {
  const response = await calendarFetch(`/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    body: JSON.stringify(buildEventPayload(task)),
  })
  if (!response.ok) {
    throw new Error(`Google Calendar API error (${response.status}): ${await response.text()}`)
  }
  return response.json()
}

// 404/410 means the event is already gone on Google's side (e.g. deleted directly in Calendar), so it's treated as a successful delete rather than blocking the local card deletion on a stale id.
export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const response = await calendarFetch(`/${encodeURIComponent(eventId)}`, { method: "DELETE" })
  if (!response.ok && response.status !== 404 && response.status !== 410) {
    throw new Error(`Google Calendar API error (${response.status}): ${await response.text()}`)
  }
}
