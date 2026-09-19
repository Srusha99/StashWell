"use client"

import * as React from "react"
import { FolderX, Info, MoveRight, RefreshCw } from "lucide-react"

import { CONTAINER_TITLE } from "@/lib/workspaces"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { CARD_SHELL } from "@/components/dashboard/dashboard-card"
import { useWorkspaces } from "@/components/workspaces/workspace-provider"

/**
 * Shown in place of the bookmark area when a workspace's backing Chrome folder
 * can't be resolved.
 *
 * This exists so that a broken workspace never silently falls back to another
 * folder - a fallback would leak one workspace's bookmarks into another. It is
 * also deliberately manual: chrome.bookmarks.onRemoved fires during an undoable
 * delete and during sync churn, so auto-recreating the folder would race sync
 * and leave duplicates behind.
 */
export function WorkspaceRepairNotice() {
  const { resolved, activeWorkspace, isBusy, repairWorkspace, relocateWorkspace } = useWorkspaces()

  if (resolved.status === "ok") return null

  if (resolved.status === "no-api") {
    return (
      <Card
        icon={<Info className="size-5" />}
        title="Bookmarks aren't available here"
        body="StashWell reads your real Chrome bookmarks, which only works when it's running as the extension's New Tab page. Notes and reminders work normally."
      />
    )
  }

  if (resolved.status === "misplaced") {
    return (
      <Card
        icon={<MoveRight className="size-5" />}
        title="This workspace's folder was moved"
        body={`"${activeWorkspace.name}" is no longer inside Other Bookmarks › ${CONTAINER_TITLE}, so its bookmarks aren't shown here to avoid mixing them with another workspace.`}
        action={
          <Button size="sm" disabled={isBusy} onClick={() => relocateWorkspace(activeWorkspace.id)}>
            <MoveRight /> Move it back
          </Button>
        }
      />
    )
  }

  return (
    <Card
      icon={<FolderX className="size-5" />}
      title="This workspace's bookmark folder is missing"
      body={`The Chrome folder behind "${activeWorkspace.name}" was deleted or renamed outside StashWell. Creating a new one gives this workspace somewhere to store bookmarks again; it won't bring back the old contents.`}
      action={
        <Button size="sm" disabled={isBusy} onClick={() => repairWorkspace(activeWorkspace.id)}>
          <RefreshCw /> Recreate folder
        </Button>
      }
    />
  )
}

function Card({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode
  title: string
  body: string
  action?: React.ReactNode
}) {
  return (
    <div className={cn(CARD_SHELL, "flex-row items-start gap-3")}>
      <div className="mt-0.5 shrink-0 text-[#8e8e93] dark:text-white/50">{icon}</div>
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="text-sm font-semibold text-[#1c1c1e] dark:text-white">{title}</h2>
        <p className="text-xs text-[#8e8e93] dark:text-white/50">{body}</p>
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  )
}
