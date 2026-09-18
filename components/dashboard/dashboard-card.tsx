"use client"

import * as React from "react"
import { GripVertical } from "lucide-react"

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
 * The card shell the notes and reminders panels share.
 *
 * Mirrors FolderCard deliberately - same classes, same drag behaviour - because
 * these sit in the very same dashboard columns and must be indistinguishable in
 * size and feel from a bookmark folder card.
 *
 * The --card-border and --shadow-soft tokens exist only under :root:not(.dark),
 * so in dark mode border-color would fall back to currentColor (a visible white
 * outline) without the dark: overrides that go with them.
 */
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
      className={cn(
        "relative flex min-w-0 flex-col rounded-2xl border border-[var(--card-border)] bg-white p-4 shadow-[var(--shadow-soft)] transition-all duration-150 ease-out dark:border-transparent dark:bg-white/[0.04] dark:shadow-none",
        isDragging && "opacity-40"
      )}
    >
      {dropIndicator === "before" && (
        <div className="absolute inset-x-2 top-0 h-0.5 rounded-full bg-primary" />
      )}
      {dropIndicator === "after" && (
        <div className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />
      )}

      <div className="mb-2.5 flex items-center gap-1.5">
        {draggable && (
          <GripVertical className="size-4 shrink-0 cursor-grab text-[#8e8e93] active:cursor-grabbing dark:text-white/30" />
        )}
        <span className="shrink-0 text-[#8e8e93] dark:text-white/40">{icon}</span>
        <h2 className="min-w-0 flex-1 truncate text-[11px] font-semibold tracking-wide text-[#1c1c1e] uppercase dark:text-white">
          {title}
        </h2>
        {count !== undefined && count > 0 && (
          <span className="shrink-0 text-[10px] leading-none text-[#8e8e93] dark:text-white/40">
            {count}
          </span>
        )}
        {headerAction}
      </div>
      {children}
    </section>
  )
}
