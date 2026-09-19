"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

export interface DashboardCardDragProps {
  isDragging?: boolean
  dropIndicator?: "before" | "after" | null
  onCardDragStart?: () => void
  onCardDragOver?: (position: "before" | "after") => void
  onCardDragLeave?: () => void
  onCardDrop?: () => void
  onCardDragEnd?: () => void
}

/**
 * The one card shell every dashboard card uses - notes, reminders and bookmark
 * folders alike. Shared as a constant rather than copied, because these sit side
 * by side in the same columns and any drift between them is immediately visible.
 *
 * Translucent + backdrop-blur so the wallpaper reads through, which is what makes
 * the dashboard feel light rather than like a wall of panels.
 *
 * The --card-border and --shadow-soft tokens exist only under :root:not(.dark),
 * so in dark mode border-color would fall back to currentColor (a visible white
 * outline) without the dark: overrides that go with them.
 */
export const CARD_SHELL =
  "group relative flex min-w-0 flex-col rounded-2xl border border-[var(--card-border)] bg-white/55 p-3.5 shadow-[var(--shadow-soft)] backdrop-blur-xl transition-all duration-150 ease-out dark:border-white/[0.08] dark:bg-white/[0.06] dark:shadow-none"

/** Shared header row: small uppercase label, muted count on the right. */
export const CARD_TITLE =
  "min-w-0 flex-1 truncate text-[10.5px] font-semibold tracking-[0.06em] text-[#1c1c1e]/80 uppercase dark:text-white/80"

export const CARD_COUNT =
  "shrink-0 text-[10px] leading-none text-[#8e8e93] dark:text-white/40"
export function DashboardCard({
  icon,
  title,
  count,
  headerAction,
  children,
  isDragging,
  dropIndicator,
  onCardDragStart,
  onCardDragOver,
  onCardDragLeave,
  onCardDrop,
  onCardDragEnd,
}: DashboardCardDragProps & {
  icon: React.ReactNode
  title: string
  count?: number
  headerAction?: React.ReactNode
  children: React.ReactNode
}) {
  const draggable = !!onCardDragStart

  function handleDragStart(event: React.DragEvent) {
    // Never start a card drag from something interactive inside it, or typing in
    // the composer would tear the card out of its column.
    const target = event.target
    if (
      target instanceof Element &&
      target.closest("button, a, input, textarea, [role='menu'], [role='menuitem']")
    ) {
      event.preventDefault()
      return
    }
    event.dataTransfer.effectAllowed = "move"
    onCardDragStart?.()
  }

  function handleDragOver(event: React.DragEvent) {
    if (!onCardDragOver) return
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    onCardDragOver(event.clientY - rect.top < rect.height / 2 ? "before" : "after")
  }

  return (
    <section
      draggable={draggable}
      onDragStart={draggable ? handleDragStart : undefined}
      onDragOver={draggable ? handleDragOver : undefined}
      onDragLeave={onCardDragLeave}
      onDrop={
        onCardDrop
          ? (event) => {
              event.preventDefault()
              onCardDrop()
            }
          : undefined
      }
      onDragEnd={onCardDragEnd}
      className={cn(CARD_SHELL, isDragging && "opacity-40")}
    >
      {dropIndicator === "before" && (
        <div className="absolute inset-x-2 top-0 h-0.5 rounded-full bg-primary" />
      )}
      {dropIndicator === "after" && (
        <div className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />
      )}

      <div className="mb-2 flex items-center gap-1.5">
        <span className="shrink-0 text-[#8e8e93] dark:text-white/40">{icon}</span>
        <h2 className={CARD_TITLE}>{title}</h2>
        {headerAction}
        {count !== undefined && count > 0 && <span className={CARD_COUNT}>{count}</span>}
      </div>
      {children}
    </section>
  )
}
