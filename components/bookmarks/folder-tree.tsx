"use client"

import * as React from "react"
import { ChevronRight, EyeOff, Folder, FolderPlus, MoreVertical, Pencil, Trash2 } from "lucide-react"

import { type BookmarkNode, isFolder } from "@/hooks/use-bookmarks"
import { cn, deferred } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export interface FolderTreeActions {
  onSelect: (id: string) => void
  onRename: (node: BookmarkNode) => void
  onNewSubfolder: (parentId: string) => void
  onDelete: (node: BookmarkNode) => void
  onHide: (folderId: string) => void
}

export function FolderTree({
  nodes,
  currentFolderId,
  depth = 0,
  ...actions
}: FolderTreeActions & {
  nodes: BookmarkNode[]
  currentFolderId: string
  depth?: number
}) {
  const folders = nodes.filter(isFolder)

  return (
    <div className="flex flex-col gap-0.5">
      {folders.map((node) => (
        <FolderTreeItem
          key={node.id}
          node={node}
          currentFolderId={currentFolderId}
          depth={depth}
          {...actions}
        />
      ))}
    </div>
  )
}

function FolderTreeItem({
  node,
  currentFolderId,
  depth,
  onSelect,
  onRename,
  onNewSubfolder,
  onDelete,
  onHide,
}: FolderTreeActions & {
  node: BookmarkNode
  currentFolderId: string
  depth: number
}) {
  const [expanded, setExpanded] = React.useState(depth === 0)
  const childFolders = (node.children ?? []).filter(isFolder)
  const hasChildFolders = childFolders.length > 0
  const isActive = node.id === currentFolderId

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-md pr-1 text-sm text-white/80 hover:bg-white/10",
          isActive && "bg-white/15 font-medium text-white"
        )}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
      >
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded text-white/50",
            !hasChildFolders && "invisible"
          )}
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          <ChevronRight className={cn("size-3.5 transition-transform", expanded && "rotate-90")} />
        </button>

        <button
          type="button"
          onClick={() => onSelect(node.id)}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left"
        >
          <Folder className="size-3.5 shrink-0 text-white/50" />
          <span className="truncate">{node.title || "(untitled)"}</span>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-white/70 opacity-0 hover:bg-white/10 hover:text-white group-hover:opacity-100 data-[popup-open]:opacity-100"
              />
            }
          >
            <MoreVertical />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={deferred(() => onNewSubfolder(node.id))}>
              <FolderPlus /> New subfolder
            </DropdownMenuItem>
            <DropdownMenuItem onClick={deferred(() => onRename(node))}>
              <Pencil /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={deferred(() => onHide(node.id))}>
              <EyeOff /> Hide from dashboard
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={deferred(() => onDelete(node))}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {expanded && hasChildFolders && (
        <FolderTree
          nodes={childFolders}
          currentFolderId={currentFolderId}
          depth={depth + 1}
          onSelect={onSelect}
          onRename={onRename}
          onNewSubfolder={onNewSubfolder}
          onDelete={onDelete}
          onHide={onHide}
        />
      )}
    </div>
  )
}
