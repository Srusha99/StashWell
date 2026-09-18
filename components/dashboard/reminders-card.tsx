"use client"

import * as React from "react"
import { AlarmClock, Bell, BellOff, Check, Pencil, Plus, Trash2 } from "lucide-react"

import { type Reminder, describeReminder, hasFired } from "@/lib/reminders"
import {
  type TestResult,
  missingNotificationApis,
  notificationsAvailable,
  sendTestNotification,
} from "@/lib/reminder-schedule"
import { useReminders } from "@/hooks/use-reminders"
import { useReminderSync } from "@/hooks/use-reminder-sync"
import { useWorkspaces } from "@/components/workspaces/workspace-provider"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DashboardCard,
  type DashboardCardDragProps,
} from "@/components/dashboard/dashboard-card"
import {
  ReminderComposer,
  type ReminderDraft,
} from "@/components/dashboard/reminder-composer"

const EMPTY_DRAFT: ReminderDraft = { title: "", dueAt: "", recurrence: "once" }

export function RemindersCard({
  workspaceId,
  ...drag
}: DashboardCardDragProps & { workspaceId: string }) {
  const { workspaces } = useWorkspaces()
  const {
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
  } = useReminders(workspaceId)

  // Rebuilds the chrome.alarms schedule whenever stored reminders change. Lives
  // here rather than in the provider because this is where the changes happen;
  // each sync re-reads every workspace, so the others are covered too.
  //
  // `muted` has to be part of the revision, not just `reminders`: muting changes
  // no reminder, so without it the alarms would keep firing until the next
  // unrelated edit. Memoised so the effect doesn't re-run on every render.
  const syncRevision = React.useMemo(() => [reminders, muted] as const, [reminders, muted])
  useReminderSync(workspaces, syncRevision)

  // null = collapsed, a string id = editing that reminder, "" = composing a new one.
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState<ReminderDraft>(EMPTY_DRAFT)

  const canNotify = notificationsAvailable()
  const missingApis = missingNotificationApis()
  const [testResult, setTestResult] = React.useState<TestResult | null>(null)
  const [testing, setTesting] = React.useState(false)

  function startNew() {
    setDraft(EMPTY_DRAFT)
    setEditingId("")
  }

  function startEdit(reminder: Reminder) {
    setDraft({
      title: reminder.title,
      dueAt: reminder.dueAt ?? "",
      recurrence: reminder.recurrence,
    })
    setEditingId(reminder.id)
  }

  function handleSave() {
    if (editingId) {
      updateReminder(editingId, {
        title: draft.title.trim(),
        dueAt: draft.dueAt || null,
        recurrence: draft.recurrence,
      })
    } else {
      addReminder(draft.title, draft.dueAt || null, draft.recurrence)
    }
    setEditingId(null)
    setDraft(EMPTY_DRAFT)
  }

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
    <DashboardCard
      {...drag}
      icon={<AlarmClock className="size-3.5" />}
      title="Reminders"
      count={openCount}
      headerAction={
        canNotify ? (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={toggleMuted}
            aria-pressed={muted}
            aria-label={muted ? "Unmute reminder notifications" : "Mute reminder notifications"}
            title={muted ? "Notifications muted here" : "Notifications on"}
            className="size-5 shrink-0 text-[#8e8e93] hover:text-[#1c1c1e] dark:text-white/40 dark:hover:text-white"
          >
            {muted ? <BellOff className="size-3" /> : <Bell className="size-3" />}
          </Button>
        ) : null
      }
    >
      {visible.length === 0 && editingId === null && (
        <p className="text-xs text-[#8e8e93] dark:text-white/40">Nothing to be reminded of.</p>
      )}

      <ul className="flex flex-col">
        {visible.map((reminder) => (
          <ReminderRow
            key={reminder.id}
            reminder={reminder}
            now={now}
            onToggleDone={() => toggleDone(reminder.id)}
            onEdit={() => startEdit(reminder)}
            onDelete={() => {
              if (editingId === reminder.id) setEditingId(null)
              deleteReminder(reminder.id)
            }}
          />
        ))}
      </ul>

      {editingId === null ? (
        <button
          type="button"
          onClick={startNew}
          className="mt-1.5 flex items-center gap-1 self-start text-xs text-[#8e8e93] transition-colors hover:text-[#1c1c1e] dark:text-white/40 dark:hover:text-white"
        >
          <Plus className="size-3" /> Add reminder
        </button>
      ) : (
        <ReminderComposer
          draft={draft}
          onChange={setDraft}
          onCancel={() => {
            setEditingId(null)
            setDraft(EMPTY_DRAFT)
          }}
          onSave={handleSave}
          now={now}
        />
      )}

      {completedCount > 0 && editingId === null && (
        <button
          type="button"
          onClick={clearCompleted}
          className="mt-1 self-start text-[11px] text-[#8e8e93] transition-colors hover:text-[#1c1c1e] dark:text-white/40 dark:hover:text-white"
        >
          Clear {completedCount} done
        </button>
      )}

      {/* Notifications used to fail silently in every direction - no permission,
          dead worker, OS-level block - which made "it didn't ring" impossible to
          diagnose. This names the actual reason. */}
      {(missingApis.length > 0 || testResult || muted) && (
        <div className="mt-1.5 flex flex-col gap-0.5">
          {muted && canNotify && (
            <span className="text-[11px] text-[#8e8e93] dark:text-white/40">Muted here.</span>
          )}
          {missingApis.length > 0 && (
            <span className="text-[11px] text-destructive">
              Permissions missing ({missingApis.join(", ")}).
            </span>
          )}
          {testResult && (
            <span
              className={cn(
                "text-[11px]",
                testResult.ok ? "text-[#8e8e93] dark:text-white/40" : "text-destructive"
              )}
            >
              {testResult.ok
                ? "Sent - if nothing appeared, Chrome or Windows is suppressing it."
                : testResult.reason}
            </span>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={runTest}
        disabled={testing}
        className="mt-1 self-start text-[11px] text-[#8e8e93] underline-offset-2 transition-colors hover:text-[#1c1c1e] hover:underline disabled:opacity-50 dark:text-white/40 dark:hover:text-white"
      >
        {testing ? "Testing..." : "Test notification"}
      </button>
    </DashboardCard>
  )
}

function ReminderRow({
  reminder,
  now,
  onToggleDone,
  onEdit,
  onDelete,
}: {
  reminder: Reminder
  now: Date
  onToggleDone: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const isDone = reminder.completedAt !== null
  const fired = hasFired(reminder, now)
  // Both a completed reminder and one whose time has passed read as "settled":
  // struck through with a tick, per the design.
  const settled = isDone || fired

  return (
    <li className="group flex items-start gap-1.5 rounded-lg px-1 py-1 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.03]">
      <button
        type="button"
        role="checkbox"
        aria-checked={isDone}
        onClick={onToggleDone}
        aria-label={isDone ? `Reopen "${reminder.title}"` : `Complete "${reminder.title}"`}
        className={cn(
          "mt-0.5 flex size-3 shrink-0 items-center justify-center rounded-[3px] transition-colors",
          settled ? "text-[#8e8e93] dark:text-white/40" : "bg-primary hover:ring-2 hover:ring-primary/30"
        )}
      >
        {settled && <Check className="size-3" />}
      </button>

      <div className="flex min-w-0 flex-1 flex-col">
        <span
          className={cn(
            "truncate text-xs",
            settled
              ? "text-[#8e8e93] line-through dark:text-white/40"
              : "font-medium text-[#1c1c1e] dark:text-white"
          )}
        >
          {reminder.title}
        </span>
        <span className="truncate text-[10px] text-[#8e8e93] dark:text-white/40">
          {describeReminder(reminder, now)}
        </span>
      </div>

      {/* Hidden until hover so the list reads as cleanly as the design. */}
      <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onEdit}
          aria-label={`Edit "${reminder.title}"`}
          className="size-5 text-[#8e8e93] hover:text-[#1c1c1e] dark:text-white/40 dark:hover:text-white"
        >
          <Pencil className="size-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onDelete}
          aria-label={`Delete "${reminder.title}"`}
          className="size-5 text-[#8e8e93] hover:text-destructive dark:text-white/40"
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
    </li>
  )
}
