"use client"

import * as React from "react"

import { type BookmarkNode, isFolder } from "@/hooks/use-bookmarks"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function ConfirmDeleteDialog({
  node,
  onOpenChange,
  onConfirm,
}: {
  node: BookmarkNode | null
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void>
}) {
  const [isDeleting, setIsDeleting] = React.useState(false)
  if (!node) return null

  const folder = isFolder(node)
  const childCount = node.children?.length ?? 0

  async function handleConfirm() {
    setIsDeleting(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Dialog open={!!node} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {folder ? "folder" : "bookmark"}?</DialogTitle>
          <DialogDescription>
            {folder
              ? `"${node.title}" and ${childCount} item${childCount === 1 ? "" : "s"} inside it will be permanently deleted.`
              : `"${node.title}" will be permanently deleted.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={isDeleting}>
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
