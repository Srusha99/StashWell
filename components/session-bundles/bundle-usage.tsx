"use client"

import { FREE_BUNDLE_LIMIT } from "@/lib/bundle-gate"
import { cn } from "@/lib/utils"

/** r = 100 / 2π, so the ring's circumference is exactly 100 and a dash of N reads as N%. */
const RING_RADIUS = 15.9155

/**
 * Free's "1/2 Used" badge beside "Saved Bundles": a progress ring and a count,
 * blue while there's room and orange once the limit is reached. Opens the
 * Active Bundles sheet.
 */
export function BundleUsageBadge({ count, onClick }: { count: number; onClick: () => void }) {
  const full = count >= FREE_BUNDLE_LIMIT
  const percent = Math.min(100, (count / FREE_BUNDLE_LIMIT) * 100)

  return (
    <button
      type="button"
      onClick={onClick}
      title="View active bundles"
      className={cn(
        "flex items-center gap-1.5 rounded-full border py-[5px] pr-2.5 pl-2 transition hover:-translate-y-px",
        full
          ? "border-[#ffedd5] bg-[#fff7ed] hover:bg-[#ffedd5] hover:shadow-[0_2px_6px_rgba(249,115,22,0.15)]"
          : "border-[#dbeafe] bg-[#eff6ff] hover:bg-[#dbeafe] hover:shadow-[0_2px_6px_rgba(59,130,246,0.15)]"
      )}
    >
      <svg viewBox="0 0 36 36" className="size-4 shrink-0 -rotate-90" aria-hidden>
        <circle
          cx="18"
          cy="18"
          r={RING_RADIUS}
          fill="none"
          strokeWidth="6"
          className={full ? "stroke-[#ffedd5]" : "stroke-[#dbeafe]"}
        />
        {percent > 0 && (
          <circle
            cx="18"
            cy="18"
            r={RING_RADIUS}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${percent}, 100`}
            className={full ? "stroke-[#f97316]" : "stroke-[#3b82f6]"}
          />
        )}
      </svg>
      <span
        className={cn(
          "text-[0.65rem] font-bold tracking-[-0.01em]",
          full ? "text-[#c2410c]" : "text-[#2563eb]"
        )}
      >
        {count}/{FREE_BUNDLE_LIMIT} Used
      </span>
    </button>
  )
}
