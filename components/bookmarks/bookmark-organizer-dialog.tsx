"use client"

import { FolderCog } from "lucide-react"

import { type BookmarkNode } from "@/hooks/use-bookmarks"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  BookmarkOrganizerPanel,
  type BookmarkOrganizerBookmarksApi,
} from "@/components/bookmarks/bookmark-organizer-panel"

export function BookmarkOrganizerDialog({
  open,
  onOpenChange,
  root,
  initialRootId,
  bookmarks,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  root: BookmarkNode | null
  initialRootId?: string
  bookmarks: BookmarkOrganizerBookmarksApi
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderCog className="size-4" /> Bookmark Organizer
          </DialogTitle>
          <DialogDescription>
            Reorder, rename, create, and delete items inside the selected root subtree.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <BookmarkOrganizerPanel root={root} initialRootId={initialRootId} bookmarks={bookmarks} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
