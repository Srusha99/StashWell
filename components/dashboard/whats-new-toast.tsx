"use client"

import { X } from "lucide-react"

export function WhatsNewToast({
  onOpenWhatsNew,
  onDismiss,
}: {
  onOpenWhatsNew: () => void
  onDismiss: () => void
}) {
  return (
    <div className="animate-in slide-in-from-bottom-5 fixed bottom-6 right-6 z-50 flex items-center gap-1 rounded-full border border-white/90 bg-white/75 p-1.5 shadow-[0_45px_90px_-20px_rgba(0,0,0,0.35),0_30px_60px_-15px_rgba(0,0,0,0.25),0_10px_20px_-5px_rgba(0,0,0,0.15),0_2px_4px_rgba(0,0,0,0.08),inset_0_3px_6px_rgba(255,255,255,1),inset_0_-8px_16px_rgba(0,0,0,0.08)] backdrop-blur-2xl backdrop-saturate-200 transition-shadow duration-300 hover:shadow-[0_60px_120px_-20px_rgba(0,0,0,0.4),0_40px_80px_-20px_rgba(0,0,0,0.3),0_15px_30px_-5px_rgba(0,0,0,0.18),0_4px_8px_rgba(0,0,0,0.1),inset_0_3px_6px_rgba(255,255,255,1),inset_0_-8px_16px_rgba(0,0,0,0.08)]">
      <button
        type="button"
        onClick={onOpenWhatsNew}
        className="rounded-full px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-black/[0.04]"
      >
        Stashwell leveled up&nbsp;&nbsp;tap to see how 🔥
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="flex size-7 shrink-0 items-center justify-center rounded-full text-neutral-500 transition-all hover:scale-110 hover:bg-black/[0.04] hover:text-black"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
