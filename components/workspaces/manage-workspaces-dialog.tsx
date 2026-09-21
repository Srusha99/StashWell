"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { WorkspacesSettings } from "@/components/workspaces/workspaces-settings"

/**
 * The standalone workspace manager, opened from the workspace switcher. The same
 * list is also the Workspaces section of the Settings dialog - both render
 * WorkspacesSettings, which holds all the behaviour.
 */
export function ManageWorkspacesDialog({
  open,
  onOpenChange,
  startCreating = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  startCreating?: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Workspaces</DialogTitle>
          <DialogDescription>
            Each workspace keeps its own bookmarks, notes, and reminders.
          </DialogDescription>
        </DialogHeader>

        {/* Keyed so the create form's fields reset each time the dialog opens. */}
        {open && (
          <WorkspacesSettings
            key={String(startCreating)}
            startCreating={startCreating}
          />
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
