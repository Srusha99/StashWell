"use client"

import * as React from "react"
import { Loader2, Upload } from "lucide-react"

import { type WorkspaceBackup, countItems } from "@/lib/workspace-backup"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/**
 * Confirms a destructive restore before it runs - the parsed backup file is
 * already validated by the caller (lib/workspace-backup.ts's
 * parseWorkspaceBackup); this dialog just shows what will be deleted vs.
 * restored and asks once, clearly, since there is no undo for this one.
 */
export function RestoreBackupDialog({
  backup,
  workspaceName,
  currentItemCount,
  onOpenChange,
  onConfirm,
}: {
  backup: WorkspaceBackup | null
  workspaceName: string
  currentItemCount: number
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void>
}) {
  const [isRestoring, setIsRestoring] = React.useState(false)
  if (!backup) return null

  const incomingCount = countItems(backup.bookmarks)

  async function handleConfirm() {
    setIsRestoring(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } finally {
      setIsRestoring(false)
    }
  }

  return (
    <Dialog open={!!backup} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Restore &ldquo;{workspaceName}&rdquo; from backup?</DialogTitle>
          <DialogDescription>
            This deletes all {currentItemCount} item{currentItemCount === 1 ? "" : "s"} currently
            in this workspace and replaces them with {incomingCount} item
            {incomingCount === 1 ? "" : "s"} from the backup (exported{" "}
            {new Date(backup.exportedAt).toLocaleDateString()}). This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={isRestoring}>
            {isRestoring ? <Loader2 className="animate-spin" /> : <Upload />}
            {isRestoring ? "Restoring..." : "Restore"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
