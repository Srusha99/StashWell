import { readWorkspaceJson, writeWorkspaceJson } from "@/lib/workspace-storage"

export interface Note {
  id: string
  title: string
  body: string
  /** Epoch ms. These are instants, not calendar days, so a number is right. */
  createdAt: number
  updatedAt: number
  pinned?: boolean
}

const STORAGE_NAME = "notes"

function isNote(value: unknown): value is Note {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as Partial<Note>
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.body === "string" &&
    typeof candidate.createdAt === "number" &&
    typeof candidate.updatedAt === "number"
  )
}

/**
 * Array order IS the display order, so this never sorts on read - only pinned
 * notes are floated, and that happens at render time.
 *
 * Items are validated individually rather than trusting the parsed blob: a
 * single corrupt entry shouldn't discard the rest of the user's notes.
 */
export function readNotes(workspaceId: string): Note[] {
  return readWorkspaceJson<Note[]>(workspaceId, STORAGE_NAME, [], (parsed) =>
    Array.isArray(parsed) ? parsed.filter(isNote) : null
  )
}

export function writeNotes(workspaceId: string, notes: Note[]): void {
  writeWorkspaceJson(workspaceId, STORAGE_NAME, notes)
}

export function createNote(title = "", body = ""): Note {
  const now = Date.now()
  return { id: newNoteId(), title, body, createdAt: now, updatedAt: now }
}

/** Pinned first, then existing array order - a stable sort preserves the rest. */
export function sortedForDisplay(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false))
}

export function notePreview(note: Note): string {
  const firstLine = note.body.split("\n").find((line) => line.trim().length > 0) ?? ""
  return firstLine.trim()
}

function newNoteId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }
}
