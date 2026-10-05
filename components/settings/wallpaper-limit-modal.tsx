"use client"

import { RefreshCw, Zap } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { WALLPAPER_LIMITS } from "@/lib/wallpaper-gate"

/**
 * Shown when an upload would need a slot and none is free: swap it in for the
 * current upload, or - on Free - upgrade for more slots.
 */
export function WallpaperLimitModal({
  open,
  onOpenChange,
  isPro,
  fileName,
  replaceName,
  busy,
  onReplace,
  onUpgrade,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  isPro: boolean
  /** The file being added. */
  fileName: string
  /** The upload it would replace. */
  replaceName: string
  busy: boolean
  onReplace: () => void
  onUpgrade: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isPro
              ? `All ${WALLPAPER_LIMITS.pro.slots} upload slots are in use`
              : "Your free upload slot is in use"}
          </DialogTitle>
          <DialogDescription>
            {isPro
              ? `Replace "${replaceName}" with "${fileName}", or remove an upload first.`
              : `Free includes ${WALLPAPER_LIMITS.free.slots} custom wallpaper. Replace "${replaceName}" with "${fileName}", or upgrade to Pro for ${WALLPAPER_LIMITS.pro.slots} upload slots, video wallpapers and a daily slideshow.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onReplace} disabled={busy}>
            <RefreshCw /> Replace Current Wallpaper
          </Button>
          {!isPro && (
            <Button className="bg-emerald-500 text-white hover:bg-emerald-600" onClick={onUpgrade}>
              <Zap className="fill-current" /> Upgrade to Pro
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
