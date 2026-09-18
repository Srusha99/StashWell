/**
 * Bridges reminders to the notification service worker.
 *
 * Reminders live in localStorage, namespaced per workspace. A service worker has
 * no access to localStorage at all, so it cannot read them directly. Rather than
 * move the whole store to async chrome.storage (which would break the synchronous
 * lazy-useState reads every hook here relies on), the page stays the single
 * source of truth and mirrors a minimal, flattened schedule into
 * chrome.storage.local, then owns the chrome.alarms that drive it.
 *
 * The worker therefore only ever READS. Nothing it does needs to travel back,
 * because "fired" is derived from the clock in lib/reminders.ts rather than
 * stored - which is what keeps this one-directional and simple.
 */

import { type Reminder, nextOccurrence, readReminders, readRemindersMuted } from "@/lib/reminders"
import type { Workspace } from "@/lib/workspaces"

export const SCHEDULE_KEY = "reminderSchedule"
export const ALARM_PREFIX = "stashwell-reminder:"

export interface ScheduledReminder {
  id: string
  title: string
  workspaceName: string
  /** Epoch ms of the next occurrence. */
  when: number
  /** Set for repeating reminders so Chrome re-fires them itself. */
  periodInMinutes?: number
}

function hasAlarms(): boolean {
  return typeof chrome !== "undefined" && !!chrome.alarms
}

function hasStorage(): boolean {
  return typeof chrome !== "undefined" && !!chrome.storage?.local
}

const PERIOD_MINUTES = { daily: 1440, weekly: 10080 } as const

/** Flattens every workspace's upcoming reminders into one schedule. */
export function buildSchedule(workspaces: Workspace[], now: Date = new Date()): ScheduledReminder[] {
  const scheduled: ScheduledReminder[] = []

  for (const workspace of workspaces) {
    // A muted workspace still shows its reminders on the dashboard; it just
    // doesn't raise notifications for them.
    if (readRemindersMuted(workspace.id)) continue

    for (const reminder of readReminders(workspace.id)) {
      if (reminder.completedAt !== null) continue
      const next = nextOccurrence(reminder, now)
      // Only future occurrences are worth an alarm: a one-off whose time already
      // passed has "fired" as far as the UI is concerned, and Chrome would fire
      // a past `when` immediately, notifying about something long gone.
      if (!next || next.getTime() <= now.getTime()) continue

      scheduled.push({
        id: reminder.id,
        title: reminder.title,
        workspaceName: workspace.name,
        when: next.getTime(),
        ...(reminder.recurrence === "once"
          ? {}
          : { periodInMinutes: PERIOD_MINUTES[reminder.recurrence] }),
      })
    }
  }

  return scheduled
}

/**
 * Writes the schedule where the worker can read it and rebuilds the alarm set.
 *
 * Clears our own alarms first so edits and deletions can't leave an orphan alarm
 * firing for a reminder that no longer exists. Only alarms under our prefix are
 * touched, in case anything else in the extension ever uses them.
 */
export async function syncSchedule(workspaces: Workspace[]): Promise<void> {
  if (!hasStorage()) return

  const schedule = buildSchedule(workspaces)

  try {
    await chrome.storage.local.set({ [SCHEDULE_KEY]: schedule })
  } catch {
    return
  }

  if (!hasAlarms()) return

  try {
    const existing = await chrome.alarms.getAll()
    await Promise.all(
      existing
        .filter((alarm) => alarm.name.startsWith(ALARM_PREFIX))
        .map((alarm) => chrome.alarms.clear(alarm.name))
    )

    for (const item of schedule) {
      chrome.alarms.create(`${ALARM_PREFIX}${item.id}`, {
        when: item.when,
        ...(item.periodInMinutes ? { periodInMinutes: item.periodInMinutes } : {}),
      })
    }
  } catch {
    // Alarms unavailable or quota hit - the dashboard still works, it just won't
    // raise notifications.
  }
}

/** True when this context can actually raise reminder notifications. */
export function notificationsAvailable(): boolean {
  return hasAlarms() && hasStorage() && typeof chrome?.notifications !== "undefined"
}

/**
 * Which of the required APIs are missing.
 *
 * Almost always all-or-nothing: if the extension was *reloaded* rather than
 * removed and re-added after the manifest gained `alarms` / `notifications` /
 * `storage`, Chrome never grants them and every one of these is undefined. That
 * is by far the most common reason reminders go quiet, so it's worth naming
 * rather than failing silently.
 */
export function missingNotificationApis(): string[] {
  if (typeof chrome === "undefined") return ["chrome"]
  const missing: string[] = []
  if (!chrome.alarms) missing.push("alarms")
  if (!chrome.notifications) missing.push("notifications")
  if (!chrome.storage?.local) missing.push("storage")
  return missing
}

export interface TestResult {
  ok: boolean
  reason?: string
  level?: string
}

/**
 * Asks the service worker to raise a notification right now, and reports back
 * what actually happened. Goes through the worker rather than notifying from the
 * page so it exercises the same path a real reminder takes - if the worker is
 * dead or unregistered, this is what says so.
 */
export async function sendTestNotification(): Promise<TestResult> {
  const missing = missingNotificationApis()
  if (missing.length > 0) {
    return {
      ok: false,
      reason: `Missing extension permissions: ${missing.join(", ")}. Remove StashWell from chrome://extensions and load it again from out/ - a plain reload won't grant newly added permissions.`,
    }
  }

  try {
    const result = (await chrome.runtime.sendMessage({
      type: "stashwell:test-notification",
    })) as TestResult | undefined

    return (
      result ?? {
        ok: false,
        reason:
          "The background service worker didn't respond. Open chrome://extensions, find StashWell and check 'service worker' for errors.",
      }
    )
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error
          ? error.message
          : "Couldn't reach the background service worker.",
    }
  }
}

export type { Reminder }
