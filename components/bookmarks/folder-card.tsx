"use client"

import * as React from "react"
import {
  BookmarkPlus,
  EyeOff,
  Folder,
  FolderCog,
  Grid2x2,
  GripVertical,
  List,
  MoreVertical,
  Pencil,
  SquareArrowOutUpRight,
  Trash2,
} from "lucide-react"

import { type BookmarkNode, isFolder } from "@/hooks/use-bookmarks"
import { useCustomIcon } from "@/hooks/use-custom-icon"
import { useFolderViewMode } from "@/hooks/use-folder-view-mode"
import { faviconUrl } from "@/lib/favicon"
import { cn, deferred } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { BookmarkRow } from "@/components/bookmarks/bookmark-row"

function collectUrls(nodes: BookmarkNode[]): string[] {
  const urls: string[] = []
  for (const node of nodes) {
    if (isFolder(node)) {
      urls.push(...collectUrls(node.children ?? []))
    } else if (node.url) {
      urls.push(node.url)
    }
  }
  return urls
}

export interface FolderCardActions {
  onEditBookmark: (node: BookmarkNode) => void
  onDeleteBookmark: (node: BookmarkNode) => void
  onDrillInto: (folderId: string) => void
  onNewBookmark: (parentId: string) => void
  onOrganize: (folderId: string) => void
  onRename: (node: BookmarkNode) => void
  onDelete: (node: BookmarkNode) => void
  onHide: (folderId: string) => void
}

export function FolderCard({
  id,
  title,
  node,
  items,
  isDragging,
  dropIndicator,
  onCardDragStart,
  onCardDragOver,
  onCardDragLeave,
  onCardDrop,
  onCardDragEnd,
  ...actions
}: FolderCardActions & {
  id: string
  title: string
  node: BookmarkNode | null
  items: BookmarkNode[]
  isDragging: boolean
  dropIndicator: "before" | "after" | null
  onCardDragStart: () => void
  onCardDragOver: (position: "before" | "after") => void
  onCardDragLeave: () => void
  onCardDrop: () => void
  onCardDragEnd: () => void
}) {
  const [viewMode, setViewMode] = useFolderViewMode(id)
  const isRealFolder = node !== null
  const allUrls = React.useMemo(() => collectUrls(items), [items])

  function handleOpenAll() {
    for (const url of allUrls) {
      window.open(url, "_blank")
    }
  }

  function handleDragOver(event: React.DragEvent) {
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const position = event.clientY - rect.top < rect.height / 2 ? "before" : "after"
    onCardDragOver(position)
  }

  function handleDragStart(event: React.DragEvent) {
    const target = event.target
    if (target instanceof Element && target.closest("button, a, [role='menu'], [role='menuitem']")) {
      event.preventDefault()
      return
    }
    event.dataTransfer.effectAllowed = "move"
    onCardDragStart()
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={onCardDragLeave}
      onDrop={(event) => {
        event.preventDefault()
        onCardDrop()
      }}
      onDragEnd={onCardDragEnd}
      className={cn(
        "relative rounded-2xl bg-white/[0.04] p-4",
        isDragging && "opacity-40"
      )}
    >
      {dropIndicator === "before" && (
        <div className="absolute inset-x-2 top-0 h-0.5 rounded-full bg-primary" />
      )}
      {dropIndicator === "after" && (
        <div className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />
      )}

      <div className="mb-3 flex items-center gap-2">
        <GripVertical className="size-4 shrink-0 cursor-grab text-white/30 active:cursor-grabbing" />
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{title}</h2>
        {allUrls.length > 0 && (
          <Button
            variant="ghost"
            size="icon-xs"
            title="Open all bookmarks"
            className="shrink-0 text-white/40 hover:bg-white/10 hover:text-white/70"
            onClick={handleOpenAll}
          >
            <SquareArrowOutUpRight />
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className="shrink-0 text-white/40 hover:bg-white/10 hover:text-white/70"
              />
            }
          >
            <MoreVertical />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}>
              {viewMode === "grid" ? (
                <>
                  <List /> List view
                </>
              ) : (
                <>
                  <Grid2x2 /> Grid view
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={deferred(() => actions.onNewBookmark(id))}>
              <BookmarkPlus /> New Bookmark
            </DropdownMenuItem>
            <DropdownMenuItem onClick={deferred(() => actions.onOrganize(id))}>
              <FolderCog /> Organize bookmarks
            </DropdownMenuItem>
            {isRealFolder && (
              <DropdownMenuItem onClick={deferred(() => actions.onRename(node))}>
                <Pencil /> Rename
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => actions.onHide(id)}>
              <EyeOff /> Hide folder
            </DropdownMenuItem>
            {isRealFolder && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={deferred(() => actions.onDelete(node))}>
                  <Trash2 /> Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-white/40">Empty</p>
      ) : viewMode === "grid" ? (
        <FolderIconGrid items={items} onDrillInto={actions.onDrillInto} />
      ) : (
        <div className="flex flex-col">
          {items.map((item) => (
            <BookmarkRow
              key={item.id}
              node={item}
              onEdit={actions.onEditBookmark}
              onDelete={actions.onDeleteBookmark}
              onDrillInto={actions.onDrillInto}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FolderIconGrid({
  items,
  onDrillInto,
}: {
  items: BookmarkNode[]
  onDrillInto: (folderId: string) => void
}) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {items.map((item) =>
        isFolder(item) ? (
          <button
            key={item.id}
            type="button"
            onClick={() => onDrillInto(item.id)}
            title={item.title}
            className="flex aspect-square items-center justify-center opacity-90 hover:opacity-100"
          >
            <Folder className="size-12 text-white/50" />
          </button>
        ) : (
          <GridIconItem key={item.id} item={item} />
        )
      )}
    </div>
  )
}

function GridIconItem({ item }: { item: BookmarkNode }) {
  const [customIcon] = useCustomIcon(item.url ?? null)
  const icon = customIcon ?? (item.url ? faviconUrl(item.url, 128) : undefined)

  return (
    <a
      href={item.url}
      title={item.title || item.url}
      className="flex aspect-square items-center justify-center opacity-90 hover:opacity-100"
    >
      {icon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={icon} alt="" className="size-12 rounded-xl object-contain" />
      ) : (
        <Grid2x2 className="size-12 text-white/50" />
      )}
    </a>
  )
}
