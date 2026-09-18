"use client"

import * as React from "react"

import { syncSchedule } from "@/lib/reminder-schedule"
import type { Workspace } from "@/lib/workspaces"

/**
 * Keeps the notification schedule in step with stored reminders.
 *
 * `revision` is any value that changes when reminders change - passing the active
 * workspace's reminders array is enough, because that is the only workspace whose
 * reminders can be edited. Other workspaces are still picked up, since each sync
 * rebuilds the schedule from every workspace's storage, and one runs on mount.
 */
export function useReminderSync(workspaces: Workspace[], revision: unknown): void {
  React.useEffect(() => {
    void syncSchedule(workspaces)
    // `revision` is intentionally a dependency despite being unused in the body:
    // it is the signal that stored reminders changed and the schedule needs
    // rebuilding from localStorage.
  }, [workspaces, revision])
}
