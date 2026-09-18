"use client"

import * as React from "react"
import { CalendarDays, Clock, X } from "lucide-react"

import {
  PRESETS,
  RECURRENCE_LABELS,
  type Recurrence,
  formatWhen,
  presetValue,
} from "@/lib/reminders"
import { parseLocalDateTime } from "@/lib/dates"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DateTimePicker } from "@/components/dashboard/date-time-picker"

const RECURRENCES: Recurrence[] = ["once", "daily", "weekly"]

export interface ReminderDraft {
  title: string
  dueAt: string
  recurrence: Recurrence
}

/**
 * The expanded reminder composer: title, quick presets, a date/time field, a
 * Once/Daily/Weekly segmented control, and Cancel/Save.
 */
export function ReminderComposer({
  draft,
  onChange,
  onCancel,
  onSave,
  now,
}: {
  draft: ReminderDraft
  onChange: (next: ReminderDraft) => void
  onCancel: () => void
  onSave: () => void
  now: Date
}) {
  const parsed = parseLocalDateTime(draft.dueAt)
  const canSave = draft.title.trim().length > 0
  const [pickerOpen, setPickerOpen] = React.useState(false)

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (canSave) onSave()
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 flex flex-col gap-2.5 rounded-2xl border border-[var(--card-border)] bg-white p-3 shadow-[var(--shadow-soft)] dark:border-white/10 dark:bg-white/[0.06] dark:shadow-none"
    >
      <Input
        value={draft.title}
        onChange={(event) => onChange({ ...draft, title: event.target.value })}
        placeholder="Remind me to..."
        aria-label="Reminder"
        autoFocus
        className="h-9 border-[#e5e5ea] bg-white text-[#1c1c1e] placeholder:text-[#8e8e93] dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-white/40"
      />

      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onChange({ ...draft, dueAt: presetValue(preset.id, now) })}
            className="rounded-full border border-[#e5e5ea] px-2.5 py-1 text-xs text-[#3c3c43] transition-colors hover:border-primary hover:text-primary dark:border-white/15 dark:text-white/70 dark:hover:border-primary dark:hover:text-white"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Opens the in-app calendar rather than Chrome's native datetime popup. */}
      <div className="flex h-9 items-center gap-2 rounded-xl border border-[#e5e5ea] px-2.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:border-white/15">
        <CalendarDays className="size-4 shrink-0 text-[#8e8e93] dark:text-white/40" />
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          aria-haspopup="dialog"
          aria-label={
            parsed ? `Change date and time (${formatWhen(parsed, now)})` : "Set date and time"
          }
          className={cn(
            "min-w-0 flex-1 truncate text-left text-sm",
            parsed ? "text-[#1c1c1e] dark:text-white" : "text-[#8e8e93] dark:text-white/40"
          )}
        >
          {parsed ? formatWhen(parsed, now) : "No date set"}
        </button>
        {parsed && (
          <button
            type="button"
            onClick={() => onChange({ ...draft, dueAt: "" })}
            aria-label="Clear date"
            title="Clear date"
            className="shrink-0 text-[#8e8e93] transition-colors hover:text-[#1c1c1e] dark:text-white/40 dark:hover:text-white"
          >
            <X className="size-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          aria-label="Open date and time picker"
          className="shrink-0 text-[#8e8e93] transition-colors hover:text-[#1c1c1e] dark:text-white/40 dark:hover:text-white"
        >
          <Clock className="size-4" />
        </button>
      </div>

      <DateTimePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        value={draft.dueAt}
        onChange={(next) => onChange({ ...draft, dueAt: next })}
      />

      <div className="flex items-center gap-0.5 rounded-xl border border-[#e5e5ea] p-0.5 dark:border-white/15">
        {RECURRENCES.map((recurrence) => {
          const selected = draft.recurrence === recurrence
          return (
            <button
              key={recurrence}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange({ ...draft, recurrence })}
              className={cn(
                "flex-1 rounded-[10px] py-1.5 text-xs font-medium transition-colors",
                selected
                  ? "bg-accent text-accent-foreground"
                  : "text-[#8e8e93] hover:text-[#1c1c1e] dark:text-white/50 dark:hover:text-white"
              )}
            >
              {RECURRENCE_LABELS[recurrence]}
            </button>
          )
        })}
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={!canSave}>
          Save
        </Button>
      </div>
    </form>
  )
}
