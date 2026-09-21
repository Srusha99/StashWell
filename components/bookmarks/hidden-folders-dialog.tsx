"use client"

import { Eye, Folder } from "lucide-react"

import {
  BOOKMARKS_BAR_ID,
  type BookmarkNode,
  findNode,
} from "@/hooks/use-bookmarks"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

function labelFor(root: BookmarkNode | null, id: string): string {
  if (id === BOOKMARKS_BAR_ID) return "Bookmarks Bar"
  return findNode(root ? [root] : [], id)?.title || "(untitled)"
}

/** Copy shared by the dialog and the Settings section, so both read the same. */
export function hiddenFoldersSummary(count: number): string {
  return count === 0
    ? "No folders are hidden from the dashboard."
    : "These folders are hidden from the dashboard. Unhide to show them again."
}

/** The list on its own, so the Bookmarks section of Settings can reuse it. */
export function HiddenFoldersList({
  root,
  hiddenIds,
  onUnhide,
}: {
  root: BookmarkNode | null
  hiddenIds: Set<string>
  onUnhide: (id: string) => void
}) {
  const ids = Array.from(hiddenIds)
  if (ids.length === 0) return null

  return (
    <div className="flex flex-col gap-1">
      {ids.map((id) => (
        <div
          key={id}
          className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm"
        >
          <Folder className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{labelFor(root, id)}</span>
          <Button variant="ghost" size="xs" onClick={() => onUnhide(id)}>
            <Eye /> Unhide
          </Button>
        </div>
      ))}
    </div>
  )
}

export function HiddenFoldersDialog({
  open,
  onOpenChange,
  root,
  hiddenIds,
  onUnhide,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  root: BookmarkNode | null
  hiddenIds: Set<string>
  onUnhide: (id: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hidden folders</DialogTitle>
          <DialogDescription>
            {hiddenFoldersSummary(hiddenIds.size)}
          </DialogDescription>
        </DialogHeader>

        <HiddenFoldersList
          root={root}
          hiddenIds={hiddenIds}
          onUnhide={onUnhide}
        />
      </DialogContent>
    </Dialog>
  )
}
