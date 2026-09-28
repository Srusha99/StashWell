"use client"

import { Undo2, X } from "lucide-react"

/**
 * Bottom-right pill with an Undo action, for the bookmark-health delete flow.
 * No shared toast component exists in this app (components/dashboard/whats-new-toast.tsx
 * is the closest thing, but it's a bespoke one-off styled for the dashboard's
 * glassy light wallpaper) - this is the dark-dialog-friendly equivalent.
 * Auto-dismiss timing is the caller's job.
 */
export function UndoToast({
  message,
  onUndo,
  onDismiss,
}: {
  message: string
  onUndo: () => void
  onDismiss: () => void
}) {
  return (
    <div className="animate-in slide-in-from-bottom-5 fixed bottom-6 right-6 z-[60] flex items-center gap-1 rounded-full border border-border bg-popover p-1.5 text-popover-foreground shadow-lg ring-1 ring-foreground/10">
      <span className="px-3 py-2 text-sm">{message}</span>
      <button
        type="button"
        onClick={onUndo}
        className="flex items-center gap-1 rounded-full px-3 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
      >
        <Undo2 className="size-3.5" /> Undo
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/10"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
