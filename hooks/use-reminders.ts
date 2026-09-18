"use client"

import * as React from "react"

import {
  type Recurrence,
  type Reminder,
  createReminder,
  readReminders,
  readRemindersMuted,
  sortedForDisplay,
  writeReminders,
  writeRemindersMuted,
} from "@/lib/reminders"
import { useNow } from "@/hooks/use-now"

export type { Reminder, Recurrence }

/**
 * Reminders for one workspace.
 *
 * The `useNow(30_000)` ticker matters: this is a new-tab page that gets left open
 * for hours, and every label here ("Fired", "Every day at 09:00", "Tomorrow ·
 * 01:30") is derived from the current time rather than stored, so without it the
 * list would quietly go stale.
 */
export function useReminders(workspaceId: string) {
  const [reminders, setReminders] = React.useState<Reminder[]>(() => readReminders(workspaceId))
  const [muted, setMuted] = React.useState<boolean>(() => readRemindersMuted(workspaceId))
  const now = useNow(30_000)

  const persist = React.useCallback(
    (next: Reminder[]) => {
      writeReminders(workspaceId, next)
      setReminders(next)
    },
    [workspaceId]
  )

  const addReminder = React.useCallback(
    (title: string, dueAt: string | null, recurrence: Recurrence) => {
      const trimmed = title.trim()
      if (!trimmed) return null
      const reminder = createReminder(trimmed, dueAt, recurrence)
      persist([...reminders, reminder])
      return reminder
    },
    [reminders, persist]
  )

  const updateReminder = React.useCallback(
    (
      id: string,
      patch: { title?: string; dueAt?: string | null; recurrence?: Recurrence }
    ) => {
      persist(
        reminders.map((reminder) => (reminder.id === id ? { ...reminder, ...patch } : reminder))
      )
    },
    [reminders, persist]
  )

  const toggleDone = React.useCallback(
    (id: string) => {
      persist(
        reminders.map((reminder) =>
          reminder.id === id
            ? { ...reminder, completedAt: reminder.completedAt === null ? Date.now() : null }
            : reminder
        )
      )
    },
    [reminders, persist]
  )

  const deleteReminder = React.useCallback(
    (id: string) => persist(reminders.filter((reminder) => reminder.id !== id)),
    [reminders, persist]
  )

  const clearCompleted = React.useCallback(
    () => persist(reminders.filter((reminder) => reminder.completedAt === null)),
    [reminders, persist]
  )

  const toggleMuted = React.useCallback(() => {
    setMuted((current) => {
      const next = !current
      writeRemindersMuted(workspaceId, next)
      return next
    })
  }, [workspaceId])

  const visible = React.useMemo(() => sortedForDisplay(reminders, now), [reminders, now])
  const openCount = reminders.filter((reminder) => reminder.completedAt === null).length
  const completedCount = reminders.length - openCount

  return {
    reminders,
    visible,
    openCount,
    completedCount,
    muted,
    now,
    addReminder,
    updateReminder,
    toggleDone,
    deleteReminder,
    clearCompleted,
    toggleMuted,
  }
}
