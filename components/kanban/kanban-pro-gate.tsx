"use client"

import * as React from "react"
import { Lock, Zap } from "lucide-react"

import { useStoredIsPro } from "@/hooks/use-is-pro"
import { STATUSES } from "@/lib/kanban"
import { COLUMN_COLOR } from "@/components/spectrumui/kanbanboard"
import { Button } from "@/components/ui/button"

/**
 * Pro gate for the Kanban views that live outside the dashboard - the overlay
 * panel content.js docks on every site, and the Kanban popup window. The
 * dashboard's own entry (components/dashboard/view-switcher.tsx) gates with a
 * dialog; these render the board's frame either way, so the lock is shown in
 * place of the board instead. Same copy as ProUpgradeModal.
 */
export function KanbanProGate({
  children,
  preview = false,
}: {
  children: React.ReactNode
  /** Show the lock over a blurred preview of the board. Only the docked
   * overlay panel (kanban-panel.tsx) sets this. */
  preview?: boolean
}) {
  const isPro = useStoredIsPro()

  // Still reading the saved session - render nothing rather than flash either.
  if (isPro === null) return null
  if (isPro) return <>{children}</>

  if (!preview) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-6 text-center">
        <LockNotice />
      </div>
    )
  }

  return (
    // The preview stays in normal flow so it sets the height - kanban-panel.tsx
    // sizes its iframe from this - and the lock notice sits on top of it.
    <div className="relative">
      <KanbanPreview />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl bg-white/40 px-4 text-center dark:bg-neutral-900/40">
        <LockNotice />
      </div>
    </div>
  )
}

function LockNotice() {
  return (
    <>
      <div className="flex size-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
        <Lock className="size-5" />
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-[#1c1c1e] dark:text-white">
          Kanban Board is a Pro feature
        </h2>
        <p className="max-w-sm text-xs text-[#3a3a3c] dark:text-white/70">
          Upgrade to drag your tasks through To Do, In Progress, and Done, plus everything else
          in Pro.
        </p>
      </div>
      {/* No checkout flow exists yet - inert, matching ProUpgradeModal. */}
      <Button size="sm" className="bg-emerald-500 text-white hover:bg-emerald-600">
        <Zap className="fill-current" /> Upgrade to Pro
      </Button>
    </>
  )
}

/**
 * A static, blurred mock of an empty components/spectrumui/kanbanboard.tsx -
 * same three columns, colors and "Add a card" row, no cards - so a free user
 * can see what the board looks like. Never the user's real cards. Inert:
 * nothing in it can be focused, clicked or dragged.
 */
function KanbanPreview() {
  return (
    <div
      aria-hidden
      className="pointer-events-none grid select-none grid-cols-3 gap-2 blur-[2px]"
    >
      {STATUSES.map(({ status, label }) => (
        <div
          key={status}
          className="min-h-[220px] min-w-0 rounded-xl border border-border bg-white/20 p-2 dark:border-neutral-700/50 dark:bg-neutral-900/20"
        >
          <div className="mb-2 flex items-center justify-between gap-1.5">
            <div className="flex min-w-0 items-center gap-1.5">
              <div
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: COLUMN_COLOR[status] }}
              />
              <h3 className="truncate text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                {label}
              </h3>
            </div>
            <span className="rounded-full bg-neutral-100/80 px-1.5 py-0.5 text-[10px] font-medium text-neutral-700 dark:bg-neutral-800/80 dark:text-neutral-300">
              0
            </span>
          </div>
          <div className="space-y-1">
            <div className="rounded-lg border border-dashed border-neutral-300/60 px-2.5 py-1.5 text-xs text-neutral-500 dark:border-neutral-700/60">
              + Add a card
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
