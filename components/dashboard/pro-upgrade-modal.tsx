"use client"

import { Zap } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function ProUpgradeModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upgrade to StashWell Pro</DialogTitle>
          <DialogDescription>
            Kanban Board is a Pro feature. Upgrade to drag your folders and
            bookmarks through custom stages, plus everything else in Pro.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Maybe later
          </Button>
          {/* No checkout flow exists yet - shown as a real button, but inert
              until there's somewhere for it to send the user. */}
          <Button className="bg-emerald-500 text-white hover:bg-emerald-600">
            <Zap className="fill-current" /> Upgrade to Pro
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
