"use client"

import * as React from "react"
import { KanbanIcon } from "@/components/icons/kanban-icon"
import { cn, deferred } from "@/lib/utils"
import { useIsPro } from "@/hooks/use-is-pro"
import { Button } from "@/components/ui/button"
import { ProUpgradeModal } from "@/components/dashboard/pro-upgrade-modal"

export type ViewMode = "grid" | "kanban"

export function ViewSwitcher({
  currentView,
  onViewChange,
  className,
  buttonRef,
}: {
  currentView: ViewMode
  onViewChange: (view: ViewMode) => void
  className?: string
  buttonRef?: React.Ref<HTMLButtonElement>
}) {
  const isPro = useIsPro()
  const [upgradeOpen, setUpgradeOpen] = React.useState(false)
  const isKanban = currentView === "kanban"

  function handleClick() {
    if (isKanban) {
      onViewChange("grid")
      return
    }
    if (!isPro) {
      // deferred() because opening a Dialog in the same tick as a click races
      // focus return against the backdrop's aria-hidden - see lib/utils.ts.
      deferred(() => setUpgradeOpen(true))()
      return
    }
    onViewChange("kanban")
  }

  return (
    <>
      <Button
        ref={buttonRef}
        type="button"
        variant="secondary"
        size="sm"
        aria-label="Toggle Kanban Board"
        aria-pressed={isKanban}
        title="Kanban Board"
        onClick={handleClick}
        className={cn(
          "gap-1.5 rounded-full border border-[var(--card-border)] bg-white px-3 text-[#1c1c1e] shadow-[var(--shadow-soft)] backdrop-blur-md hover:bg-[#fafafa] dark:border-white/15 dark:bg-black/40 dark:text-white dark:shadow-none dark:hover:bg-black/60",
          isKanban && "bg-[#fafafa] dark:bg-black/60",
          className
        )}
      >
        <KanbanIcon className="size-4" />
      </Button>

      <ProUpgradeModal open={upgradeOpen} onOpenChange={setUpgradeOpen} />
    </>
  )
}
