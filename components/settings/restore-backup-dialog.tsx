"use client"

import * as React from "react"
import { Loader2, Upload } from "lucide-react"

import { type RestorePlan, countItems } from "@/lib/workspace-backup"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`
}

/**
 * Confirms a destructive restore before it runs - the backup file is already
 * parsed and planned by the caller (lib/workspace-backup.ts's
 * parseBackup/planRestore); this dialog just lists every workspace the restore
 * replaces or creates, and the kanban board, and asks once, clearly, since
 * there is no undo for this one.
 */
export function RestoreBackupDialog({
  plan,
  currentTaskCount,
  onOpenChange,
  onConfirm,
}: {
  plan: RestorePlan | null
  currentTaskCount: number
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void>
}) {
  const [isRestoring, setIsRestoring] = React.useState(false)
  if (!plan) return null

  const exportedOn = plan.exportedAt ? new Date(plan.exportedAt).toLocaleDateString() : null

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
    <Dialog open={!!plan} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Restore from backup?</DialogTitle>
          <DialogDescription>
            Everything below is replaced with the backup
            {exportedOn ? ` exported ${exportedOn}` : ""}. Workspaces that aren&apos;t in the
            backup stay as they are. This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>

        <ul className="flex flex-col gap-1 text-sm">
          {plan.targets.map((target) => {
            const incoming = plural(countItems(target.saved.bookmarks), "item")
            return (
              <li
                key={target.workspace?.id ?? `new:${target.saved.id}`}
                className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2"
              >
                <span className="min-w-0 truncate">
                  {target.workspace?.emoji ?? target.saved.emoji}{" "}
                  {target.workspace?.name ?? target.saved.name}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {target.workspace
                    ? `${target.currentItemCount} → ${incoming}`
                    : `New workspace · ${incoming}`}
                </span>
              </li>
            )
          })}
          {plan.tasks && (
            <li className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2">
              <span>Kanban board</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {currentTaskCount} → {plural(plan.tasks.length, "task")}
              </span>
            </li>
          )}
        </ul>

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
