"use client"

import * as React from "react"
import { Copy, FolderInput } from "lucide-react"

import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"
import { useWorkspaces } from "@/components/workspaces/workspace-provider"

/**
 * "Move to workspace" / "Copy to workspace" submenus for a bookmark folder.
 *
 * Both render nothing when there is nowhere to send the folder - a single
 * workspace, no bookmarks API, or a folder that is itself a workspace root - so
 * callers can drop them into a menu unconditionally.
 */
function TransferSubmenu({
  folderId,
  label,
  icon,
  onPick,
}: {
  folderId: string
  label: string
  icon: React.ReactNode
  onPick: (folderId: string, workspaceId: string) => Promise<boolean>
}) {
  const { moveTargets, workspaceFolderIds, isBusy } = useWorkspaces()

  if (moveTargets.length === 0 || workspaceFolderIds.has(folderId)) return null

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        {icon} {label}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-44">
        {moveTargets.map((workspace) => (
          <DropdownMenuItem
            key={workspace.id}
            className="gap-2"
            disabled={isBusy}
            onClick={() => {
              void onPick(folderId, workspace.id)
            }}
          >
            {/* Fixed box so varying emoji widths don't misalign the names. */}
            <span
              aria-hidden
              className="flex size-4 shrink-0 items-center justify-center text-[13px] leading-none"
            >
              {workspace.emoji}
            </span>
            <span className="truncate">{workspace.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

export function MoveToWorkspaceSubmenu({ folderId }: { folderId: string }) {
  const { moveFolderToWorkspace } = useWorkspaces()
  return (
    <TransferSubmenu
      folderId={folderId}
      label="Move to workspace"
      icon={<FolderInput />}
      onPick={moveFolderToWorkspace}
    />
  )
}

export function CopyToWorkspaceSubmenu({ folderId }: { folderId: string }) {
  const { copyFolderToWorkspace } = useWorkspaces()
  return (
    <TransferSubmenu
      folderId={folderId}
      label="Copy to workspace"
      icon={<Copy />}
      onPick={copyFolderToWorkspace}
    />
  )
}
