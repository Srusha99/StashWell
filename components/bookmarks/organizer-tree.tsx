"use client"

import * as React from "react"
import { ChevronRight, Folder, GripVertical, Pencil, Plus, Trash2 } from "lucide-react"

import { type BookmarkNode, findNode, isFolder } from "@/hooks/use-bookmarks"
import { cn } from "@/lib/utils"
import { FaviconImg } from "@/components/bookmarks/favicon-image"
import { Button } from "@/components/ui/button"

function containsNode(node: BookmarkNode, id: string): boolean {
  if (node.id === id) return true
  return (node.children ?? []).some((child) => containsNode(child, id))
}

export interface OrganizerTreeActions {
  onRename: (node: BookmarkNode) => void
  onNewChild: (parentId: string) => void
  onDelete: (node: BookmarkNode) => void
  onMove: (nodeId: string, destination: { parentId: string; index?: number }) => void
}

type DropZone = "before" | "after" | "into"

export function OrganizerTree({
  nodes,
  foldersOnly,
  expandedIds,
  onToggleExpand,
  ...actions
}: OrganizerTreeActions & {
  nodes: BookmarkNode[]
  foldersOnly: boolean
  expandedIds: Set<string>
  onToggleExpand: (id: string) => void
  depth?: number
}) {
  const [draggedId, setDraggedId] = React.useState<string | null>(null)
  const [dropTarget, setDropTarget] = React.useState<{ id: string; zone: DropZone } | null>(null)

  const visible = foldersOnly ? nodes.filter(isFolder) : nodes

  if (visible.length === 0) {
    return null
  }

  return (
    <div className="flex flex-col gap-0.5">
      {visible.map((node) => (
        <OrganizerTreeItem
          key={node.id}
          node={node}
          roots={nodes}
          depth={0}
          foldersOnly={foldersOnly}
          expandedIds={expandedIds}
          onToggleExpand={onToggleExpand}
          draggedId={draggedId}
          setDraggedId={setDraggedId}
          dropTarget={dropTarget}
          setDropTarget={setDropTarget}
          {...actions}
        />
      ))}
    </div>
  )
}

function OrganizerTreeItem({
  node,
  roots,
  depth,
  foldersOnly,
  expandedIds,
  onToggleExpand,
  draggedId,
  setDraggedId,
  dropTarget,
  setDropTarget,
  onRename,
  onNewChild,
  onDelete,
  onMove,
}: OrganizerTreeActions & {
  node: BookmarkNode
  roots: BookmarkNode[]
  depth: number
  foldersOnly: boolean
  expandedIds: Set<string>
  onToggleExpand: (id: string) => void
  draggedId: string | null
  setDraggedId: (id: string | null) => void
  dropTarget: { id: string; zone: DropZone } | null
  setDropTarget: (target: { id: string; zone: DropZone } | null) => void
}) {
  const folder = isFolder(node)
  const children = foldersOnly ? (node.children ?? []).filter(isFolder) : node.children ?? []
  const hasChildren = children.length > 0
  const expanded = expandedIds.has(node.id)
  const isDragging = draggedId === node.id
  const isDropTarget = dropTarget?.id === node.id

  function handleDragStart(event: React.DragEvent) {
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", node.id)
    setDraggedId(node.id)
  }

  function handleDragOver(event: React.DragEvent) {
    if (!draggedId || draggedId === node.id) return
    event.preventDefault()

    const rect = event.currentTarget.getBoundingClientRect()
    const offset = (event.clientY - rect.top) / rect.height
    let zone: DropZone
    if (folder && offset > 0.25 && offset < 0.75) {
      zone = "into"
    } else {
      zone = offset <= 0.5 ? "before" : "after"
    }
    setDropTarget({ id: node.id, zone })
  }

  function handleDragLeave() {
    if (dropTarget?.id === node.id) setDropTarget(null)
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault()
    const draggedNodeId = event.dataTransfer.getData("text/plain") || draggedId
    setDraggedId(null)
    setDropTarget(null)
    if (!draggedNodeId || draggedNodeId === node.id) return
    if (containsNode(node, draggedNodeId)) return

    const zone = dropTarget?.zone ?? "after"
    const draggedNode = findNode(roots, draggedNodeId)
    if (zone === "into" && folder) {
      onMove(draggedNodeId, { parentId: node.id, index: node.children?.length ?? 0 })
    } else if (node.parentId) {
      let index = zone === "before" ? node.index ?? 0 : (node.index ?? 0) + 1
      if (
        draggedNode?.parentId === node.parentId &&
        (draggedNode.index ?? 0) < index
      ) {
        // The move API removes the dragged node first, which shifts every
        // later sibling's index down by one before inserting at `index`.
        index -= 1
      }
      onMove(draggedNodeId, { parentId: node.parentId, index })
    }
  }

  return (
    <div>
      <div
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onDragEnd={() => {
          setDraggedId(null)
          setDropTarget(null)
        }}
        className={cn(
          "group relative flex items-center gap-1 rounded-md pr-1 text-sm text-[#3c3c43] hover:bg-black/[0.04] dark:text-white/80 dark:hover:bg-white/10",
          isDragging && "opacity-40",
          isDropTarget && dropTarget?.zone === "into" && "bg-primary/20 ring-1 ring-primary/50"
        )}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
      >
        {isDropTarget && dropTarget?.zone === "before" && (
          <div className="absolute inset-x-1 top-0 h-0.5 rounded-full bg-primary" />
        )}
        {isDropTarget && dropTarget?.zone === "after" && (
          <div className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-primary" />
        )}

        <GripVertical className="size-3.5 shrink-0 cursor-grab text-[#8e8e93] active:cursor-grabbing dark:text-white/30" />

        <button
          type="button"
          onClick={() => onToggleExpand(node.id)}
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded text-[#8e8e93] dark:text-white/50",
            !hasChildren && "invisible"
          )}
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          <ChevronRight className={cn("size-3.5 transition-transform", expanded && "rotate-90")} />
        </button>

        <span className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left">
          {folder ? (
            <Folder className="size-3.5 shrink-0 text-[#8e8e93] dark:text-white/50" />
          ) : node.url ? (
            <FaviconImg
              url={node.url}
              className="size-3.5 shrink-0 rounded-sm"
              fallback={<Folder className="size-3.5 shrink-0 text-[#8e8e93] dark:text-white/50" />}
            />
          ) : (
            <Folder className="size-3.5 shrink-0 text-[#8e8e93] dark:text-white/50" />
          )}
          <span className="truncate">{node.title || "(untitled)"}</span>
        </span>

        <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
          {folder && (
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-[#8e8e93] hover:bg-black/[0.04] hover:text-[#1c1c1e] dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
              onClick={() => onNewChild(node.id)}
              aria-label="Add child"
            >
              <Plus />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-[#8e8e93] hover:bg-black/[0.04] hover:text-[#1c1c1e] dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
            onClick={() => onRename(node)}
            aria-label="Rename"
          >
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-[#8e8e93] hover:bg-destructive/10 hover:text-destructive dark:text-white/70 dark:hover:bg-destructive/20"
            onClick={() => onDelete(node)}
            aria-label="Delete"
          >
            <Trash2 />
          </Button>
        </div>
      </div>

      {expanded && hasChildren && (
        <div className="flex flex-col gap-0.5">
          {children.map((child) => (
            <OrganizerTreeItem
              key={child.id}
              node={child}
              roots={roots}
              depth={depth + 1}
              foldersOnly={foldersOnly}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              draggedId={draggedId}
              setDraggedId={setDraggedId}
              dropTarget={dropTarget}
              setDropTarget={setDropTarget}
              onRename={onRename}
              onNewChild={onNewChild}
              onDelete={onDelete}
              onMove={onMove}
            />
          ))}
        </div>
      )}
    </div>
  )
}
