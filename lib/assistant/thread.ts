/**
 * Assistant transcript, persisted per workspace.
 *
 * Goes through readWorkspaceJson/writeWorkspaceJson, which wrap window.localStorage
 * in try/catch - that is what makes this module safe to import during the
 * static-export prerender. Never touch `window` at module scope here.
 *
 * Stored under `bm:ws:<id>:assistant-thread`, so clearWorkspaceData already
 * deletes a thread along with its workspace.
 */

import { readWorkspaceJson, writeWorkspaceJson } from "@/lib/workspace-storage"

const STORAGE_NAME = "assistant-thread"

/**
 * Transcripts compete for the 5MB origin quota with bm:icon:<url> data URLs, and
 * the cap is per workspace, so keep it modest.
 */
const MAX_MESSAGES = 60

export type MessageRole = "user" | "assistant"

export interface MessageAction {
  kind: "reminder" | "note"
  id: string
  /** Lets a confirmation offer Undo, and remember it was taken. */
  undone?: boolean
}

export interface ThreadMessage {
  id: string
  role: MessageRole
  text: string
  createdAt: number
  /** Present on a confirmation, so it can offer Undo / change time. */
  action?: MessageAction
}

function isMessage(value: unknown): value is ThreadMessage {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as Partial<ThreadMessage>
  return (
    typeof candidate.id === "string" &&
    (candidate.role === "user" || candidate.role === "assistant") &&
    typeof candidate.text === "string" &&
    typeof candidate.createdAt === "number"
  )
}

export function readThread(workspaceId: string): ThreadMessage[] {
  return readWorkspaceJson<ThreadMessage[]>(workspaceId, STORAGE_NAME, [], (parsed) =>
    Array.isArray(parsed) ? parsed.filter(isMessage) : null
  )
}

export function writeThread(workspaceId: string, messages: ThreadMessage[]): void {
  writeWorkspaceJson(workspaceId, STORAGE_NAME, messages)
}

/**
 * Trims to the cap while ALWAYS keeping the most recent action-bearing message.
 * Without that, "undo that" breaks as soon as the transcript rolls over, because
 * the id it resolves against lives on the confirmation.
 */
export function capMessages(messages: ThreadMessage[]): ThreadMessage[] {
  if (messages.length <= MAX_MESSAGES) return messages

  const trimmed = messages.slice(messages.length - MAX_MESSAGES)
  if (trimmed.some((message) => message.action)) return trimmed

  const lastAction = [...messages].reverse().find((message) => message.action)
  return lastAction ? [lastAction, ...trimmed.slice(1)] : trimmed
}

export function createMessage(
  role: MessageRole,
  text: string,
  action?: MessageAction
): ThreadMessage {
  return { id: newMessageId(), role, text, createdAt: Date.now(), ...(action ? { action } : {}) }
}

/** The most recent action a follow-up like "undo that" should refer to. */
export function lastAction(messages: ThreadMessage[]): MessageAction | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const action = messages[i].action
    if (action && !action.undone) return action
  }
  return null
}

function newMessageId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }
}
