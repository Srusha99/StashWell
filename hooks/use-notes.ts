"use client"

import * as React from "react"

import { type Note, createNote, readNotes, writeNotes } from "@/lib/notes"

export type { Note }

/**
 * Notes for one workspace. Like the other per-workspace hooks this relies on
 * the dashboard subtree being keyed by workspace id, so a switch remounts and
 * the lazy initializer re-reads that workspace's notes.
 */
export function useNotes(workspaceId: string) {
  const [notes, setNotes] = React.useState<Note[]>(() => readNotes(workspaceId))

  const persist = React.useCallback(
    (next: Note[]) => {
      writeNotes(workspaceId, next)
      setNotes(next)
    },
    [workspaceId]
  )

  const addNote = React.useCallback(
    (title: string) => {
      const note = createNote(title.trim())
      // Newest first: a note you just made should be at the top of the card.
      persist([note, ...notes])
      return note
    },
    [notes, persist]
  )

  const updateNote = React.useCallback(
    (id: string, patch: { title?: string; body?: string }) => {
      persist(
        notes.map((note) =>
          note.id === id ? { ...note, ...patch, updatedAt: Date.now() } : note
        )
      )
    },
    [notes, persist]
  )

  const deleteNote = React.useCallback(
    (id: string) => persist(notes.filter((note) => note.id !== id)),
    [notes, persist]
  )

  const togglePinned = React.useCallback(
    (id: string) => {
      persist(
        notes.map((note) =>
          note.id === id ? { ...note, pinned: !note.pinned, updatedAt: Date.now() } : note
        )
      )
    },
    [notes, persist]
  )

  return { notes, addNote, updateNote, deleteNote, togglePinned }
}
