"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * The shared shapes every Settings section is built from - pane heading, labelled
 * group, label-on-the-left/control-on-the-right row, and the segmented pill.
 *
 * Kept here so each panel file is just its own settings, and so the four sections
 * can't drift apart visually.
 */

export function PaneHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4 border-b border-border pb-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  )
}

/**
 * A titled card of rows. `title` is omitted for an unlabelled group (used once,
 * for the standalone Theme row, which doesn't need its own boxed-off topic).
 *
 * Cards, rather than the pane's old top-to-bottom list divided by hairlines, so
 * each topic (Wallpaper, Effects, Card feel, ...) reads as its own bounded
 * section at a glance instead of just another paragraph in a long scroll.
 * Spacing between cards is the parent's job - see each panel's own
 * `flex flex-col gap-4` wrapper - not this component's.
 */
export function Group({
  title,
  description,
  children,
  className,
}: {
  title?: string
  description?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-border bg-muted/30 p-4",
        className
      )}
    >
      {title && (
        <div className="mb-3 border-b border-border/60 pb-2">
          <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            {title}
          </h3>
          {description && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      )}
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  )
}

/**
 * One setting: its name (and optional hint) on the left, its control on the
 * right. `stacked` drops the control onto its own full-width line instead, for
 * controls too wide to sit beside a label - a text field or a slider.
 *
 * No divider or padding of its own - rows inside a card are separated by the
 * card's own `gap-3`, the way the reference layout spaces them.
 */
export function Row({
  label,
  hint,
  control,
  stacked = false,
  disabled = false,
}: {
  label: React.ReactNode
  hint?: React.ReactNode
  control: React.ReactNode
  stacked?: boolean
  disabled?: boolean
}) {
  return (
    <div
      className={cn(
        "flex",
        stacked ? "flex-col gap-1.5" : "items-center justify-between gap-4",
        disabled && "opacity-50"
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[13px] font-medium text-foreground">{label}</span>
        {hint && (
          <span className="text-[11px] text-muted-foreground">{hint}</span>
        )}
      </div>
      <div className={cn(stacked ? "w-full" : "shrink-0")}>{control}</div>
    </div>
  )
}

/** The Light / Dark / Auto style pill. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[]
  value: T | null
  onChange: (value: T) => void
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full border border-border bg-muted/60 p-0.5">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-full px-3 py-0.5 text-[11px] font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
