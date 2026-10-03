"use client"

import * as React from "react"
import { CircleAlert, CircleCheck, CirclePlus, Loader2, RefreshCw, type LucideIcon } from "lucide-react"

import {
  type MergeResult,
  type RestoreCounts,
  type RestorePlan,
  countItems,
  countNodes,
} from "@/lib/workspace-backup"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export type RestoreMode = "merge" | "replace"

/** What a finished restore reports back, for the dialog's success step. */
export type RestoreOutcome =
  | { mode: "merge"; failed: string[]; added: MergeResult["added"] }
  | { mode: "replace"; failed: string[] }

type Phase =
  | { step: "choose" }
  | { step: "running" }
  | { step: "done"; outcome: RestoreOutcome }
  | { step: "error" }

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`
}

/** "a", "a and b", "a, b and c". */
function joinPhrases(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ""
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`
}

function quoteNames(names: string[]): string {
  return joinPhrases(names.map((name) => `“${name}”`))
}

/** "+3 bookmarks · +1 folder", or null when there's nothing to add. */
function additionsLabel(bookmarks: number, folders: number): string | null {
  const parts = [
    bookmarks > 0 && `+${plural(bookmarks, "bookmark")}`,
    folders > 0 && `+${plural(folders, "folder")}`,
  ].filter((part): part is string => !!part)
  return parts.length > 0 ? parts.join(" · ") : null
}

const MODES: {
  mode: RestoreMode
  icon: LucideIcon
  title: string
  description: string
  recommended?: boolean
}[] = [
  {
    mode: "merge",
    icon: CirclePlus,
    title: "Smart Merge",
    description:
      "Keeps everything on this device and adds only what's missing from the file - bookmarks, folders, tasks and tab bundles. Nothing is deleted.",
    recommended: true,
  },
  {
    mode: "replace",
    icon: RefreshCw,
    title: "Replace / Overwrite",
    description:
      "Puts matching workspaces and the kanban board back exactly as the file has them, deleting what they hold now. Other workspaces and tab bundles stay.",
  },
]

/** One line of the "what changes" list: a name on the left, what happens to it on the right. */
function ChangeRow({ label, detail, muted }: { label: string; detail: string; muted?: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2">
      <span className="min-w-0 truncate">{label}</span>
      <span className={cn("shrink-0 text-xs", muted ? "text-muted-foreground" : "font-medium")}>
        {detail}
      </span>
    </li>
  )
}

/** One "File contains" tile; `label` is singular, and pluralized unless `value` is 1. */
function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center rounded-lg bg-muted/50 px-2 py-1.5">
      <span className="text-base font-semibold tabular-nums">{value}</span>
      <span className="text-[11px] text-muted-foreground">{value === 1 ? label : `${label}s`}</span>
    </div>
  )
}

/**
 * Restoring a backup: what the file holds, a choice between Smart Merge
 * (lib/workspace-backup.ts's mergeBackup - only adds) and Replace
 * (restoreBackup - overwrites matched workspaces and the board), a preview of
 * exactly what the chosen mode changes, then a spinner while it runs and the
 * result. The caller has already parsed and planned the file
 * (parseBackup/planRestore/readRestoreCounts) and runs whichever mode is
 * confirmed via `onConfirm`.
 */
export function RestoreBackupDialog({
  plan,
  counts,
  onOpenChange,
  onConfirm,
}: {
  plan: RestorePlan
  counts: RestoreCounts
  onOpenChange: (open: boolean) => void
  onConfirm: (mode: RestoreMode) => Promise<RestoreOutcome>
}) {
  const [mode, setMode] = React.useState<RestoreMode>("merge")
  const [phase, setPhase] = React.useState<Phase>({ step: "choose" })
  const isRunning = phase.step === "running"

  const exportedOn = plan.exportedAt
    ? new Date(plan.exportedAt).toLocaleDateString(undefined, { dateStyle: "medium" })
    : null
  const fileBookmarks = plan.targets.reduce(
    (total, target) => total + countNodes(target.saved.bookmarks).bookmarks,
    0
  )
  const mergeHasChanges =
    plan.targets.some(
      (target) => !target.workspace || target.mergeAdds.bookmarks + target.mergeAdds.folders > 0
    ) ||
    counts.newTasks > 0 ||
    counts.newSessions > 0

  async function handleConfirm() {
    setPhase({ step: "running" })
    try {
      setPhase({ step: "done", outcome: await onConfirm(mode) })
    } catch (error) {
      console.error("[StashWell] Restore failed:", error)
      setPhase({ step: "error" })
    }
  }

  function handleOpenChange(open: boolean) {
    // A restore can't be stopped halfway, so the dialog can't be dismissed while it runs.
    if (!open && isRunning) return
    onOpenChange(open)
  }

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton={!isRunning}>
        {phase.step === "done" ? (
          <RestoreResult outcome={phase.outcome} onDone={() => onOpenChange(false)} />
        ) : phase.step === "error" ? (
          <RestoreFailed onClose={() => onOpenChange(false)} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Restore from backup</DialogTitle>
              <DialogDescription>
                {exportedOn ? `Exported ${exportedOn}. ` : ""}Choose how to bring it into this
                device - nothing changes until you confirm.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-muted-foreground">File contains</p>
              <div className="grid grid-cols-4 gap-1.5">
                <Stat value={plan.targets.length} label="Workspace" />
                <Stat value={fileBookmarks} label="Bookmark" />
                <Stat value={plan.tasks?.length ?? 0} label="Kanban task" />
                <Stat value={plan.sessions?.length ?? 0} label="Tab bundle" />
              </div>
            </div>

            <div role="radiogroup" aria-label="Restore mode" className="flex flex-col gap-2">
              {MODES.map((option) => {
                const selected = option.mode === mode
                return (
                  <button
                    key={option.mode}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={isRunning}
                    onClick={() => setMode(option.mode)}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition disabled:pointer-events-none",
                      selected
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:bg-muted/50"
                    )}
                  >
                    <option.icon
                      className={cn(
                        "mt-0.5 size-4 shrink-0",
                        selected ? "text-primary" : "text-muted-foreground"
                      )}
                    />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="flex items-center gap-1.5 text-[13px] font-medium">
                        {option.title}
                        {option.recommended && (
                          <span className="rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary">
                            Recommended
                          </span>
                        )}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{option.description}</span>
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                {mode === "merge" ? "What gets added" : "What gets replaced"}
              </p>
              <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto text-sm">
                {plan.targets.map((target) => {
                  const name = `${target.workspace?.emoji ?? target.saved.emoji} ${
                    target.workspace?.name ?? target.saved.name
                  }`
                  const key = target.workspace?.id ?? `new:${target.saved.id}`
                  const adds = additionsLabel(target.mergeAdds.bookmarks, target.mergeAdds.folders)

                  if (!target.workspace) {
                    return (
                      <ChangeRow
                        key={key}
                        label={name}
                        detail={`New workspace${adds ? ` · ${adds}` : ""}`}
                      />
                    )
                  }
                  if (mode === "merge") {
                    return (
                      <ChangeRow key={key} label={name} detail={adds ?? "Already up to date"} muted={!adds} />
                    )
                  }
                  return (
                    <ChangeRow
                      key={key}
                      label={name}
                      detail={`${target.currentItemCount} → ${plural(countItems(target.saved.bookmarks), "item")}`}
                    />
                  )
                })}

                {plan.tasks &&
                  (mode === "merge" ? (
                    <ChangeRow
                      label="Kanban board"
                      detail={counts.newTasks > 0 ? `+${plural(counts.newTasks, "task")}` : "No new tasks"}
                      muted={counts.newTasks === 0}
                    />
                  ) : (
                    <ChangeRow
                      label="Kanban board"
                      detail={`${counts.currentTasks} → ${plural(plan.tasks.length, "task")}`}
                    />
                  ))}

                {plan.sessions && (
                  <ChangeRow
                    label="Tab bundles"
                    detail={
                      mode === "replace"
                        ? "Not changed"
                        : counts.newSessions > 0
                          ? `+${plural(counts.newSessions, "bundle")}`
                          : "No new bundles"
                    }
                    muted={mode === "replace" || counts.newSessions === 0}
                  />
                )}
              </ul>

              {mode === "merge" && !mergeHasChanges && (
                <p className="text-[11px] text-muted-foreground">
                  Everything in this file is already on this device - there&apos;s nothing to add.
                </p>
              )}
              {mode === "replace" && (
                <p className="text-[11px] text-destructive">
                  What these workspaces and the board hold now is deleted. This can&apos;t be undone.
                </p>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isRunning}>
                Cancel
              </Button>
              {mode === "merge" ? (
                <Button onClick={handleConfirm} disabled={isRunning || !mergeHasChanges}>
                  {isRunning ? <Loader2 className="animate-spin" /> : <CirclePlus />}
                  {isRunning ? "Merging..." : "Merge backup"}
                </Button>
              ) : (
                <Button variant="destructive" onClick={handleConfirm} disabled={isRunning}>
                  {isRunning ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                  {isRunning ? "Replacing..." : "Replace"}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** The dialog's last step: what the restore did, or which workspaces it couldn't finish. */
function RestoreResult({ outcome, onDone }: { outcome: RestoreOutcome; onDone: () => void }) {
  const partial = outcome.failed.length > 0

  let summary: string
  if (outcome.mode === "merge") {
    const { added } = outcome
    const parts = [
      added.workspaces > 0 && plural(added.workspaces, "new workspace"),
      added.bookmarks > 0 && plural(added.bookmarks, "bookmark"),
      added.folders > 0 && plural(added.folders, "folder"),
      added.tasks > 0 && plural(added.tasks, "task"),
      added.sessions > 0 && plural(added.sessions, "tab bundle"),
    ].filter((part): part is string => !!part)
    summary =
      parts.length > 0
        ? `Added ${joinPhrases(parts)}. Everything that was already here is unchanged.`
        : "Everything in the file was already here, so nothing needed adding."
    if (partial) {
      summary += ` Couldn't finish merging ${quoteNames(outcome.failed)} - anything already added stays, and restoring the same file again adds the rest.`
    }
  } else {
    summary = partial
      ? `Couldn't restore ${quoteNames(outcome.failed)}, so ${
          outcome.failed.length === 1 ? "it was" : "they were"
        } left unchanged. Everything else was restored.`
      : "Your workspaces and kanban board now match the backup."
  }

  const Icon = partial ? CircleAlert : CircleCheck
  return (
    <>
      <div className="flex flex-col items-center gap-2 pt-2 text-center">
        <Icon className={cn("size-10", partial ? "text-amber-500" : "text-emerald-500")} />
        <DialogTitle>{partial ? "Backup partly restored" : "Backup restored successfully!"}</DialogTitle>
        <DialogDescription>{summary}</DialogDescription>
      </div>
      <DialogFooter>
        <Button onClick={onDone}>Done</Button>
      </DialogFooter>
    </>
  )
}

function RestoreFailed({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="flex flex-col items-center gap-2 pt-2 text-center">
        <CircleAlert className="size-10 text-destructive" />
        <DialogTitle>Couldn&apos;t restore that backup</DialogTitle>
        <DialogDescription>
          Something went wrong partway through. Check the backup file and try again.
        </DialogDescription>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </>
  )
}
