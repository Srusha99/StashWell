"use client"

import * as React from "react"

import {
  SCHEDULE_KEY,
  type TestResult,
  missingNotificationApis,
  notificationsAvailable,
  sendTestNotification,
} from "@/lib/reminder-schedule"
import { formatWhen } from "@/lib/reminders"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { useReminders } from "@/hooks/use-reminders"
import { useWorkspaces } from "@/components/workspaces/workspace-provider"

/**
 * Reminder controls that have no other home now the reminders card is gone.
 *
 * Mute in particular is not optional: it's per-workspace and persisted, so
 * without a control here a workspace muted before this change could never be
 * unmuted again. Clear-completed likewise, or completed reminders accumulate
 * invisibly forever.
 *
 * "N reminders armed" reads the schedule the service worker actually consumes.
 * That turns a silent sync failure - the one failure mode with no error anywhere -
 * into something visible.
 */
export function ReminderSettings() {
  const { activeWorkspace, activeId } = useWorkspaces()
  const { openCount, completedCount, muted, toggleMuted, clearCompleted } = useReminders(activeId)

  const canNotify = notificationsAvailable()
  const missingApis = missingNotificationApis()
  const [testResult, setTestResult] = React.useState<TestResult | null>(null)
  const [testing, setTesting] = React.useState(false)
  const [armed, setArmed] = React.useState<{ count: number; next: number | null } | null>(null)

  // Read back what the worker will actually see, rather than what we think we
  // wrote. Re-read whenever the open count changes.
  React.useEffect(() => {
    let active = true
    async function read() {
      if (!canNotify) return
      try {
        const stored = await chrome.storage.local.get(SCHEDULE_KEY)
        const schedule = Array.isArray(stored?.[SCHEDULE_KEY]) ? stored[SCHEDULE_KEY] : []
        if (!active) return
        const times = schedule
          .map((entry: { when?: number }) => entry?.when)
          .filter((when: unknown): when is number => typeof when === "number")
        setArmed({ count: schedule.length, next: times.length ? Math.min(...times) : null })
      } catch {
        // Storage unavailable - leave the line hidden rather than guess.
      }
    }
    void read()
    return () => {
      active = false
    }
  }, [canNotify, openCount, muted])

  async function runTest() {
    setTesting(true)
    setTestResult(null)
    try {
      setTestResult(await sendTestNotification())
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[#e5e5ea] bg-white p-3 dark:border-white/10 dark:bg-white/5">
      <label className="flex items-center justify-between text-sm text-[#3c3c43] dark:text-white/80">
        <span className="flex flex-col">
          <span>Mute notifications</span>
          <span className="text-xs text-[#8e8e93] dark:text-white/40">
            For {activeWorkspace.name} only
          </span>
        </span>
        <Switch checked={muted} onCheckedChange={toggleMuted} />
      </label>

      <div className="flex items-center justify-between text-sm text-[#3c3c43] dark:text-white/80">
        <span>
          {openCount} open
          {completedCount > 0 && `, ${completedCount} done`}
        </span>
        {completedCount > 0 && (
          <Button variant="outline" size="xs" onClick={clearCompleted}>
            Clear {completedCount} done
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-1 border-t border-black/[0.06] pt-3 dark:border-white/10">
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#8e8e93] dark:text-white/50">
            {armed
              ? armed.count === 0
                ? "No reminders armed"
                : `${armed.count} armed${armed.next ? ` · next ${formatWhen(new Date(armed.next))}` : ""}`
              : "Notification schedule unavailable"}
          </span>
          <Button variant="outline" size="xs" onClick={runTest} disabled={testing}>
            {testing ? "Testing..." : "Test notification"}
          </Button>
        </div>

        {missingApis.length > 0 && (
          <span className="text-xs text-destructive">
            Permissions missing ({missingApis.join(", ")}). Remove StashWell from
            chrome://extensions and load it again.
          </span>
        )}

        {testResult && (
          <span
            className={cn(
              "text-xs",
              testResult.ok ? "text-[#8e8e93] dark:text-white/40" : "text-destructive"
            )}
          >
            {testResult.ok
              ? "Sent - if nothing appeared, Chrome or Windows is suppressing it."
              : testResult.reason}
          </span>
        )}
      </div>
    </div>
  )
}
