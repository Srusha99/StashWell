"use client"

import * as React from "react"
import { PlusIcon, XIcon } from "lucide-react"

import { BundlePill } from "@/components/session-bundles/bundle-pill"
import { MUTED, POPUP_BACKGROUND, TEXT, TONES } from "@/components/session-bundles/tones"
import { FREE_BUNDLE_LIMIT } from "@/lib/bundle-gate"
import { type SessionBundle } from "@/lib/session-bundles"
import { cn } from "@/lib/utils"

/**
 * Free's "Active Bundles" sheet, sliding up from the bottom of the popup. It
 * opens from the usage badge, and in place of the save step once the free
 * plan's FREE_BUNDLE_LIMIT is reached - which is why it lists the bundles with
 * delete buttons: deleting one here is how to make room. Upgrading is the
 * other way out.
 *
 * Always rendered so it can slide in and out; `inert` while closed keeps its
 * buttons out of reach.
 */
export function ActiveBundlesSheet({
  open,
  onClose,
  bundles,
  atLimit,
  onSaveNew,
  onRestore,
  onDelete,
}: {
  open: boolean
  onClose: () => void
  bundles: SessionBundle[]
  atLimit: boolean
  /** Closes the sheet and starts saving a bundle. */
  onSaveNew: () => void
  onRestore: (bundle: SessionBundle) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const closeRef = React.useRef<HTMLButtonElement>(null)

  React.useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, onClose])

  return (
    <div
      inert={!open}
      onClick={onClose}
      className={cn(
        "fixed inset-0 z-50 flex items-end justify-center bg-[#0f172a]/50 p-4 backdrop-blur-[4px] transition-all duration-300",
        open ? "visible opacity-100" : "invisible opacity-0"
      )}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="active-bundles-title"
        onClick={(event) => event.stopPropagation()}
        className={cn(
          "max-h-[80vh] w-full max-w-[348px] overflow-y-auto rounded-[22px] border border-white/80 p-5 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.4)] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          TEXT,
          open ? "translate-y-0" : "translate-y-full"
        )}
        style={{ background: POPUP_BACKGROUND }}
      >
        <div className="mb-4 flex items-start justify-between border-b border-[#e2e8f0] pb-3">
          <div>
            <h2 id="active-bundles-title" className="mb-1 text-base font-bold">
              Active Bundles
            </h2>
            <p className={cn("text-[0.7rem]", MUTED)}>
              You have {bundles.length} out of {FREE_BUNDLE_LIMIT} bundles active
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={cn(
              "flex size-[30px] shrink-0 items-center justify-center rounded-full bg-[#f1f5f9] transition outline-none hover:rotate-90 hover:bg-[#fee2e2] hover:text-[#ef4444] focus-visible:ring-2 focus-visible:ring-[#3b82f6]/30",
              MUTED
            )}
          >
            <XIcon className="size-4" />
          </button>
        </div>

        <div className="mb-4 flex flex-col gap-2">
          {bundles.length === 0 ? (
            <p className={cn("py-3 text-center text-xs", MUTED)}>No saved bundles yet.</p>
          ) : (
            bundles.map((bundle) => (
              <BundlePill
                key={bundle.id}
                bundle={bundle}
                onRestore={onRestore}
                onDelete={onDelete}
                withTime
                highlight={atLimit}
              />
            ))
          )}
        </div>

        <button
          type="button"
          onClick={onSaveNew}
          disabled={atLimit}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-full py-3 text-[0.8rem] font-semibold text-white transition disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none",
            TONES.save.button
          )}
        >
          <PlusIcon className="size-4" /> Save New Bundle
        </button>
        {atLimit && (
          <p className={cn("mt-2.5 text-center text-[0.7rem] leading-snug", MUTED)}>
            Delete a bundle above to make room, or{" "}
            {/* No checkout flow exists yet - inert like every other Upgrade
                button, until there's somewhere for it to send the user. */}
            <button type="button" className="font-semibold text-[#c2410c] hover:underline">
              upgrade to Pro
            </button>{" "}
            for unlimited bundles and cloud sync.
          </p>
        )}
      </div>
    </div>
  )
}
