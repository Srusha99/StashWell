"use client"

/**
 * Shared by the Quick Share panel and an expanded BundlePill so both tab
 * lists select and share the same way: a count + Select All / Deselect All
 * header above the list, and a centered "Share" pill below it. Each list
 * passes its own tone - green in Quick Share, blue in a saved bundle.
 */

import * as React from "react"
import { CheckIcon, CopyIcon } from "lucide-react"

import { TONES, type Tone } from "@/components/session-bundles/tones"
import { copyTabsWithTitles, type SessionTab } from "@/lib/session-bundles"
import { cn } from "@/lib/utils"

/** Checkbox style for a shareable tab row, tinted to match its Share pill. */
export function shareCheckboxClass(tone: Tone): string {
  return cn("size-3.5 shrink-0 rounded-sm border border-[#cbd5e1]", TONES[tone].checkbox)
}

export function TabSelectionHeader({
  label,
  selectedCount,
  totalCount,
  onSelectAll,
  onDeselectAll,
  className,
}: {
  label?: string
  selectedCount: number
  totalCount: number
  onSelectAll: () => void
  onDeselectAll: () => void
  className?: string
}) {
  return (
    <div className={cn("flex items-center justify-between gap-2", className)}>
      <p className="text-xs font-semibold text-[#0f172a]">
        {label && `${label} `}
        <span className="font-normal text-[#64748b]">
          {label && "· "}
          {selectedCount} of {totalCount} selected
        </span>
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onSelectAll}
          className="text-[0.7rem] font-medium text-[#64748b] transition hover:text-[#0f172a] hover:underline"
        >
          Select All
        </button>
        <button
          type="button"
          onClick={onDeselectAll}
          className="text-[0.7rem] font-medium text-[#64748b] transition hover:text-[#0f172a] hover:underline"
        >
          Deselect All
        </button>
      </div>
    </div>
  )
}

/**
 * The "Share" pill under a tab list: copies `tabs` with their titles (see
 * copyTabsWithTitles), then reads "Copied!" for a moment.
 */
export function ShareTabsButton({
  tabs,
  tone,
  className,
}: {
  tabs: SessionTab[]
  tone: Tone
  className?: string
}) {
  const [copied, setCopied] = React.useState(false)
  const [copyFailed, setCopyFailed] = React.useState(false)
  const copiedTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  async function handleCopy() {
    const ok = await copyTabsWithTitles(tabs)
    setCopyFailed(!ok)
    if (!ok) return

    // Cleared first so a second quick copy isn't reset early by the first
    // copy's still-pending timeout.
    if (copiedTimer.current) clearTimeout(copiedTimer.current)
    setCopied(true)
    copiedTimer.current = setTimeout(() => setCopied(false), 1500)
  }

  const Icon = copied ? CheckIcon : CopyIcon

  return (
    <div className={cn("flex flex-col items-center gap-1.5 border-t border-[#e2e8f0] pt-2.5", className)}>
      {/* min-w keeps the pill from jumping in size when the label swaps to
          "Copied!". */}
      <button
        type="button"
        onClick={handleCopy}
        disabled={tabs.length === 0}
        className={cn(
          "flex min-w-[96px] items-center justify-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold whitespace-nowrap text-white transition active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40",
          TONES[tone].button
        )}
      >
        <Icon className="size-3 shrink-0" />
        {copied ? "Copied!" : "Share"}
      </button>
      {copyFailed && (
        <p className="text-[0.7rem] text-[#ef4444]">Couldn&apos;t copy to the clipboard - try again.</p>
      )}
    </div>
  )
}
