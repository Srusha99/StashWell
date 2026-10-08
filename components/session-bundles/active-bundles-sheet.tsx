"use client"

import * as React from "react"
import { LightbulbIcon, ZapIcon } from "lucide-react"

import { FREE_BUNDLE_LIMIT } from "@/lib/bundle-gate"
import { cn } from "@/lib/utils"

/**
 * Free's limit reminder, shown in place of the save step once the free plan's
 * FREE_BUNDLE_LIMIT is reached: a small centered card pointing to Pro.
 * Clicking outside it or pressing Escape closes it.
 *
 * Always rendered so it can fade in and out; `inert` while closed keeps its
 * button out of reach.
 */
export function ActiveBundlesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const upgradeRef = React.useRef<HTMLButtonElement>(null)

  React.useEffect(() => {
    if (!open) return
    upgradeRef.current?.focus()
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
        "fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a]/40 p-4 backdrop-blur-[3px] transition-all duration-200",
        open ? "visible opacity-100" : "invisible opacity-0"
      )}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="limit-reminder-title"
        onClick={(event) => event.stopPropagation()}
        className={cn(
          "box-border w-[260px] rounded-2xl border border-[#f3f4f6] bg-white px-4 py-[18px] text-center shadow-[0_8px_20px_-4px_rgba(0,0,0,0.08)] transition-transform duration-200",
          open ? "scale-100" : "scale-95"
        )}
      >
        <div className="mb-2 flex items-center justify-center gap-1.5">
          <LightbulbIcon className="size-4 shrink-0 text-[#fbbf24]" aria-hidden />
          <h2 id="limit-reminder-title" className="m-0 text-sm font-semibold tracking-[-0.01em] text-[#374151]">
            Just a Reminder
          </h2>
        </div>

        <p className="mb-4 text-xs leading-[1.45] text-[#9ca3af]">
          You&apos;ve reached your{" "}
          <strong className="font-semibold text-[#374151]">
            {FREE_BUNDLE_LIMIT}/{FREE_BUNDLE_LIMIT}
          </strong>{" "}
          bundle limit.
          <br />
          Upgrade to save more.
        </p>

        {/* No checkout flow exists yet - inert like every other Upgrade
            button, until there's somewhere for it to send the user. */}
        <button
          ref={upgradeRef}
          type="button"
          className="flex w-full items-center justify-center gap-1.5 rounded-[10px] bg-[#6366f1] px-3 py-2.5 text-[13px] font-semibold text-white shadow-[0_4px_12px_rgba(99,102,241,0.25)] transition hover:-translate-y-px hover:bg-[#4f46e5] focus-visible:ring-2 focus-visible:ring-[#6366f1]/30 focus-visible:outline-none"
        >
          <ZapIcon className="size-3.5" strokeWidth={2.5} aria-hidden />
          Upgrade to Pro
        </button>
      </div>
    </div>
  )
}
