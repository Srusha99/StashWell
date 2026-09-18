"use client"

import * as React from "react"
import { Pin, PinOff, Plus, StickyNote, Trash2 } from "lucide-react"

import { type Note, sortedForDisplay } from "@/lib/notes"
import { useNotes } from "@/hooks/use-notes"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DashboardCard,
  type DashboardCardDragProps,
} from "@/components/dashboard/dashboard-card"

export function NotesCard({
  workspaceId,
  ...drag
}: DashboardCardDragProps & { workspaceId: string }) {
  const { notes, addNote, updateNote, deleteNote, togglePinned } = useNotes(workspaceId)
  const [draft, setDraft] = React.useState("")
  const [adding, setAdding] = React.useState(false)
  const [expandedId, setExpandedId] = React.useState<string | null>(null)

  const ordered = React.useMemo(() => sortedForDisplay(notes), [notes])

  function handleAdd(event: React.FormEvent) {
    event.preventDefault()
    const title = draft.trim()
    if (!title) {
      setAdding(false)
      return
    }
    const note = addNote(title)
    setDraft("")
    setAdding(false)
    // Drop straight into the body - you added a note to write something in it.
    setExpandedId(note.id)
  }

  return (
    <DashboardCard {...drag} icon={<StickyNote className="size-3.5" />} title="Notes" count={notes.length}>
      {ordered.length === 0 && !adding && (
        <p className="text-xs text-[#8e8e93] dark:text-white/40">No notes yet.</p>
      )}

      <div className="flex flex-col">
        {ordered.map((note) => (
          <NoteRow
            key={note.id}
            note={note}
            isExpanded={expandedId === note.id}
            onToggle={() => setExpandedId((current) => (current === note.id ? null : note.id))}
            onChange={(patch) => updateNote(note.id, patch)}
            onTogglePinned={() => togglePinned(note.id)}
            onDelete={() => {
              if (expandedId === note.id) setExpandedId(null)
              deleteNote(note.id)
            }}
          />
        ))}
      </div>

      {adding ? (
        <form onSubmit={handleAdd} className="mt-1.5">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={handleAdd}
            placeholder="Note title"
            aria-label="New note"
            autoFocus
            className="h-7 border-[#e5e5ea] bg-white text-xs text-[#1c1c1e] placeholder:text-[#8e8e93] dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-white/40"
          />
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-1.5 flex items-center gap-1 self-start text-xs text-[#8e8e93] transition-colors hover:text-[#1c1c1e] dark:text-white/40 dark:hover:text-white"
        >
          <Plus className="size-3" /> Add a note
        </button>
      )}
    </DashboardCard>
  )
}

function NoteRow({
  note,
  isExpanded,
  onToggle,
  onChange,
  onTogglePinned,
  onDelete,
}: {
  note: Note
  isExpanded: boolean
  onToggle: () => void
  onChange: (patch: { title?: string; body?: string }) => void
  onTogglePinned: () => void
  onDelete: () => void
}) {
  // Editing runs against local state and only persists on a debounce, so a
  // 10KB note doesn't trigger a synchronous serialize-and-write per keystroke.
  const [title, setTitle] = React.useState(note.title)
  const [body, setBody] = React.useState(note.body)

  const commit = React.useCallback(
    (patch: { title?: string; body?: string }) => onChange(patch),
    [onChange]
  )

  React.useEffect(() => {
    if (!isExpanded) return
    if (title === note.title && body === note.body) return
    const id = setTimeout(() => commit({ title, body }), 300)
    return () => clearTimeout(id)
  }, [title, body, isExpanded, note.title, note.body, commit])

  return (
    <div
      className={cn(
        "group rounded-lg transition-colors",
        isExpanded
          ? "bg-black/[0.03] dark:bg-white/[0.04]"
          : "hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
      )}
    >
      <div className="flex items-center gap-1 px-1 py-1">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isExpanded}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          {note.pinned && <Pin className="size-2.5 shrink-0 text-primary" aria-label="Pinned" />}
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-xs text-[#3c3c43] dark:text-white/80",
              isExpanded && "text-[#1c1c1e] dark:text-white"
            )}
          >
            {note.title || "Untitled note"}
          </span>
        </button>

        {/* Hidden until hover so a column of notes reads cleanly. */}
        <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onTogglePinned}
            aria-label={note.pinned ? "Unpin note" : "Pin note"}
            className="size-5 text-[#8e8e93] hover:text-[#1c1c1e] dark:text-white/40 dark:hover:text-white"
          >
            {note.pinned ? <PinOff className="size-3" /> : <Pin className="size-3" />}
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onDelete}
            aria-label="Delete note"
            className="size-5 text-[#8e8e93] hover:text-destructive dark:text-white/40"
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      </div>

      {isExpanded && (
        <div className="flex flex-col gap-1.5 px-1 pb-1.5">
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => commit({ title, body })}
            placeholder="Title"
            aria-label="Note title"
            className="h-7 border-[#e5e5ea] bg-white text-xs text-[#1c1c1e] dark:border-white/15 dark:bg-white/5 dark:text-white"
          />
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            onBlur={() => commit({ title, body })}
            placeholder="Write something..."
            rows={4}
            aria-label="Note body"
            className="w-full resize-y rounded-lg border border-[#e5e5ea] bg-white px-2 py-1.5 text-xs text-[#1c1c1e] outline-none transition-colors placeholder:text-[#8e8e93] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-white/40"
          />
        </div>
      )}
    </div>
  )
}
