"use client"

import * as React from "react"

import { type ParsedCommand, parseCommand } from "@/lib/assistant/grammar"
import {
  type MessageAction,
  type ThreadMessage,
  capMessages,
  createMessage,
  lastAction,
  readThread,
  writeThread,
} from "@/lib/assistant/thread"
import { localDateTimeValue } from "@/lib/dates"
import { describeReminder, nextOccurrence } from "@/lib/reminders"
import { formatWhen } from "@/lib/reminders"
import { useNotes } from "@/hooks/use-notes"
import { useReminders } from "@/hooks/use-reminders"

/** Words that mean "the thing you just did". */
const PRONOUN = /^\s*(?:undo|that|it|this|the last one|last one)\b/i

/**
 * A button-driven send bypasses the grammar entirely - the user has already
 * said what the text means, so there's nothing to parse.
 */
export type ComposeMode = "note" | "reminder" | null

/**
 * Drives the assistant: parse a line, act on notes/reminders, append the
 * exchange to the transcript.
 *
 * Owns the reminder and note hooks so they aren't torn down when the panel's
 * portal unmounts on close.
 */
export function useAssistant(workspaceId: string, greetingName: string = "") {
  const reminders = useReminders(workspaceId)
  const notes = useNotes(workspaceId)

  const [messages, setMessages] = React.useState<ThreadMessage[]>(() => readThread(workspaceId))

  // Set the instant a reminder is created with no time of its own, so the panel
  // can pop the date/time picker open without the user having to click
  // "Change time" themselves. Cleared once the panel has opened the picker for it.
  const [awaitingTimeId, setAwaitingTimeId] = React.useState<string | null>(null)
  const clearAwaitingTime = React.useCallback(() => setAwaitingTimeId(null), [])

  const append = React.useCallback(
    (...incoming: ThreadMessage[]) => {
      setMessages((current) => {
        const next = capMessages([...current, ...incoming])
        writeThread(workspaceId, next)
        return next
      })
    },
    [workspaceId]
  )

  const clear = React.useCallback(() => {
    setMessages([])
    writeThread(workspaceId, [])
  }, [workspaceId])

  /** Marks a confirmation's action as undone so it can't be undone twice. */
  const markUndone = React.useCallback(
    (actionId: string) => {
      setMessages((current) => {
        const next = current.map((message) =>
          message.action?.id === actionId
            ? { ...message, action: { ...message.action, undone: true } }
            : message
        )
        writeThread(workspaceId, next)
        return next
      })
    },
    [workspaceId]
  )

  /**
   * Posts the mode's prompt as its own assistant bubble the instant a mode
   * button is pressed, rather than stuffing it into the composer's
   * placeholder - a placeholder disappears the moment you start typing, so it
   * read as a hint, not a question actually being asked.
   */
  const announceMode = React.useCallback(
    (mode: ComposeMode) => {
      if (!mode) return
      append(
        createMessage(
          "assistant",
          mode === "note" ? "What would you like to note down?" : "What do you want to be reminded about?"
        )
      )
    },
    [append]
  )

  const undo = React.useCallback(
    (action: MessageAction) => {
      if (action.kind === "reminder") reminders.deleteReminder(action.id)
      else notes.deleteNote(action.id)
      markUndone(action.id)
      append(createMessage("assistant", "Undone."))
    },
    [reminders, notes, markUndone, append]
  )

  const send = React.useCallback(
    (raw: string, mode: ComposeMode = null) => {
      const text = raw.trim()
      if (!text) return

      const now = new Date()
      const userMessage = createMessage("user", text)

      // "undo that" is a control phrase, not literal content - but only when the
      // user hasn't already pinned the meaning with a mode button. Picking
      // "Note" and typing "undo that" means a note titled "undo that".
      if (!mode && PRONOUN.test(text)) {
        const action = lastAction(messages)
        if (!action) {
          append(userMessage, createMessage("assistant", "There's nothing to undo yet."))
          return
        }
        append(userMessage)
        undo(action)
        return
      }

      // A mode button means the user has already told us what the text is -
      // skip the grammar and build the same shape parseCommand would produce,
      // so the switch below (and its "ask for a time" branch) runs unchanged.
      const command: ParsedCommand =
        mode === "note"
          ? { intent: "create-note", title: text, dueAt: null, recurrence: "once", assumedTime: false }
          : mode === "reminder"
            ? {
                intent: "create-reminder",
                title: text,
                dueAt: null,
                recurrence: "once",
                assumedTime: false,
              }
            : parseCommand(text, now)

      switch (command.intent) {
        case "create-reminder": {
          // Without this, "remind me at 5" leaves an empty title, addReminder
          // returns null and writes nothing - and we'd confirm a reminder that
          // does not exist.
          if (!command.title) {
            append(userMessage, createMessage("assistant", "What should I remind you about?"))
            return
          }

          // No day, time, or relative phrase at all - rather than silently saving
          // a reminder that can never fire, ask for a time and hand the picker
          // straight to the user.
          if (!command.dueAt) {
            const created = reminders.addReminder(
              command.title,
              localDateTimeValue(now),
              command.recurrence
            )
            if (!created) {
              append(userMessage, createMessage("assistant", "I couldn't save that reminder."))
              return
            }
            const who = greetingName.trim()
            append(
              userMessage,
              createMessage(
                "assistant",
                who
                  ? `Sure, ${who}! What time would you like me to set it for?`
                  : "Sure! What time would you like me to set it for?",
                { kind: "reminder", id: created.id }
              )
            )
            setAwaitingTimeId(created.id)
            return
          }

          const created = reminders.addReminder(command.title, command.dueAt, command.recurrence)
          if (!created) {
            append(userMessage, createMessage("assistant", "I couldn't save that reminder."))
            return
          }
          const when = describeReminder(created, now)
          const note = command.assumedTime ? " (assumed 9:00 - say a time to change it)" : ""
          append(
            userMessage,
            createMessage("assistant", `Reminder set — ${when}.${note}`, {
              kind: "reminder",
              id: created.id,
            })
          )
          return
        }

        case "create-note": {
          if (!command.title) {
            append(userMessage, createMessage("assistant", "What should the note say?"))
            return
          }
          const created = notes.addNote(command.title)
          if (!created) {
            append(userMessage, createMessage("assistant", "I couldn't save that note."))
            return
          }
          append(
            userMessage,
            createMessage("assistant", "Saved as a note.", { kind: "note", id: created.id })
          )
          return
        }

        case "query-reminders": {
          append(userMessage, createMessage("assistant", describeUpcoming(reminders, now)))
          return
        }

        case "query-notes": {
          const titles = notes.notes.slice(0, 8).map((note) => `· ${note.title}`)
          append(
            userMessage,
            createMessage(
              "assistant",
              titles.length ? `Your notes:\n${titles.join("\n")}` : "You have no notes."
            )
          )
          return
        }

        case "complete":
        case "delete": {
          append(userMessage, ...resolveAndAct(command.intent, command.title, reminders, notes))
          return
        }

        case "ambiguous": {
          append(
            userMessage,
            createMessage(
              "assistant",
              command.title
                ? `I got "${command.title}" but couldn't read the timing. Try a time like "at 9am", "tomorrow", a weekday, or "in 20 minutes".`
                : `I couldn't read the timing there. Try "at 9am", "tomorrow", a weekday, or "in 20 minutes".`
            )
          )
          return
        }

        default:
          append(
            userMessage,
            createMessage(
              "assistant",
              `I didn't catch that. Try "remind me at 4pm to call Bob", "note: buy milk", or "what's on today?".`
            )
          )
      }
    },
    [messages, append, undo, reminders, notes, greetingName]
  )

  return {
    messages,
    send,
    undo,
    clear,
    reminders,
    notes,
    awaitingTimeId,
    clearAwaitingTime,
    announceMode,
  }
}

/** Human answer to "what's on today?" - a message, not a list UI. */
function describeUpcoming(reminders: ReturnType<typeof useReminders>, now: Date): string {
  const open = reminders.reminders.filter((reminder) => reminder.completedAt === null)
  if (open.length === 0) return "Nothing on your list."

  const withDates = open
    .map((reminder) => ({ reminder, next: nextOccurrence(reminder, now) }))
    .sort((a, b) => (a.next?.getTime() ?? Infinity) - (b.next?.getTime() ?? Infinity))
    .slice(0, 8)

  const lines = withDates.map(({ reminder, next }) => {
    const when = next ? formatWhen(next, now) : "no date"
    return `· ${reminder.title} — ${when}`
  })
  return `You have ${open.length} open:\n${lines.join("\n")}`
}

/**
 * Resolves a complete/delete target by words. With no list in the panel there's
 * nothing to point at, so 0 or 2+ matches must ask rather than guess.
 */
function resolveAndAct(
  intent: "complete" | "delete",
  query: string,
  reminders: ReturnType<typeof useReminders>,
  notes: ReturnType<typeof useNotes>
): ThreadMessage[] {
  const needle = query.replace(/^(?:the\s+|my\s+)/i, "").trim().toLowerCase()
  if (!needle) return [createMessage("assistant", `Which one? Name part of it.`)]

  const openReminders = reminders.reminders.filter((reminder) => reminder.completedAt === null)
  const reminderHits = openReminders.filter((reminder) =>
    reminder.title.toLowerCase().includes(needle)
  )
  const noteHits = notes.notes.filter((note) => note.title.toLowerCase().includes(needle))
  const hits = [
    ...reminderHits.map((reminder) => ({ kind: "reminder" as const, id: reminder.id, title: reminder.title })),
    ...noteHits.map((note) => ({ kind: "note" as const, id: note.id, title: note.title })),
  ]

  if (hits.length === 0) return [createMessage("assistant", `I couldn't find "${query}".`)]
  if (hits.length > 1) {
    const list = hits.slice(0, 5).map((hit) => `· ${hit.title}`)
    return [
      createMessage("assistant", `That matches more than one:\n${list.join("\n")}\nWhich one?`),
    ]
  }

  const [hit] = hits
  if (intent === "complete") {
    if (hit.kind === "note") {
      notes.deleteNote(hit.id)
      return [createMessage("assistant", `Removed the note "${hit.title}".`)]
    }
    reminders.toggleDone(hit.id)
    return [createMessage("assistant", `Marked "${hit.title}" done.`)]
  }

  if (hit.kind === "reminder") reminders.deleteReminder(hit.id)
  else notes.deleteNote(hit.id)
  return [createMessage("assistant", `Deleted "${hit.title}".`)]
}
