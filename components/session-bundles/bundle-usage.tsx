"use client"

import { FREE_BUNDLE_LIMIT } from "@/lib/bundle-gate"
import { cn } from "@/lib/utils"

/** r = 100 / 2π, so the ring's circumference is exactly 100 and a dash of N reads as N%. */
const RING_RADIUS = 15.9155

/**
 * Free's "1/2 Used" badge beside "Saved Bundles": a progress ring and a count,
 * blue while there's room and orange once the limit is reached. Display only.
 */
export function BundleUsageBadge({ count }: { count: number }) {
  const full = count >= FREE_BUNDLE_LIMIT
  const percent = Math.min(100, (count / FREE_BUNDLE_LIMIT) * 100)

  return (
    <span
      className={cn(
        "flex items-center gap-1.5 rounded-full border py-[5px] pr-2.5 pl-2",
        full ? "border-[#ffedd5] bg-[#fff7ed]" : "border-[#dbeafe] bg-[#eff6ff]"
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
    </span>
  )
}
