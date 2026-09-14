"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { Folder, FolderOpen, MoreVertical, Pencil, Trash2, FolderInput } from "lucide-react"

import { type BookmarkNode, type FlatFolder, isFolder } from "@/hooks/use-bookmarks"
import { useCustomIcon } from "@/hooks/use-custom-icon"
import { cn, deferred } from "@/lib/utils"
import { faviconUrl } from "@/lib/favicon"
import { Button } from "@/components/ui/button"
import BorderGlow from "@/components/ui/BorderGlow"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const GLOW_COLORS_DARK = ["#c084fc", "#f472b6", "#38bdf8"]
const GLOW_CARD_BG_DARK = "rgba(15, 12, 20, 0.55)"
const GLOW_COLORS_LIGHT = ["#5227ff", "#8f6cff", "#c4b5fd"]
const GLOW_CARD_BG_LIGHT = "#ffffff"

function useTileGlowProps() {
  const { resolvedTheme } = useTheme()
  const isLight = resolvedTheme === "light"
  return {
    colors: isLight ? GLOW_COLORS_LIGHT : GLOW_COLORS_DARK,
    backgroundColor: isLight ? GLOW_CARD_BG_LIGHT : GLOW_CARD_BG_DARK,
    glowIntensity: isLight ? 0.15 : 0.9,
  }
}

export function BookmarkGrid({
  items,
  folders,
  onOpenFolder,
  onEditFolder,
  onNewSubfolder,
  onDeleteFolder,
  onEditBookmark,
  onDeleteBookmark,
  onMove,
}: {
  items: BookmarkNode[]
  folders: FlatFolder[]
  onOpenFolder: (id: string) => void
  onEditFolder: (node: BookmarkNode) => void
  onNewSubfolder: (parentId: string) => void
  onDeleteFolder: (node: BookmarkNode) => void
  onEditBookmark: (node: BookmarkNode) => void
  onDeleteBookmark: (node: BookmarkNode) => void
  onMove: (nodeId: string, parentId: string) => void
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-[#8e8e93] dark:text-white/50">
        This folder is empty.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {items.map((node) =>
        isFolder(node) ? (
          <FolderTile
            key={node.id}
            node={node}
            folders={folders}
            onOpen={() => onOpenFolder(node.id)}
            onRename={() => onEditFolder(node)}
            onNewSubfolder={() => onNewSubfolder(node.id)}
            onDelete={() => onDeleteFolder(node)}
            onMove={(parentId) => onMove(node.id, parentId)}
          />
        ) : (
          <BookmarkTile
            key={node.id}
            node={node}
            folders={folders}
            onEdit={() => onEditBookmark(node)}
            onDelete={() => onDeleteBookmark(node)}
            onMove={(parentId) => onMove(node.id, parentId)}
          />
        )
      )}
    </div>
  )
}

function MoveToSubmenu({
  folders,
  excludeId,
  onMove,
}: {
  folders: FlatFolder[]
  excludeId: string
  onMove: (parentId: string) => void
}) {
  const options = folders.filter((f) => f.node.id !== excludeId)
  if (options.length === 0) return null

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <FolderInput /> Move to
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {options.map(({ node, depth }) => (
          <DropdownMenuItem key={node.id} onClick={() => onMove(node.id)}>
            <span style={{ paddingLeft: `${depth * 12}px` }} className="truncate">
              {node.title || "(untitled)"}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

function TileActionsMenu({ children }: { children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            className="absolute top-1.5 right-1.5 text-[#8e8e93] opacity-0 hover:bg-black/[0.04] hover:text-[#1c1c1e] group-hover:opacity-100 data-[popup-open]:opacity-100 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
            onClick={(event: React.MouseEvent) => {
              event.preventDefault()
              event.stopPropagation()
            }}
          />
        }
      >
        <MoreVertical />
      </DropdownMenuTrigger>
      <DropdownMenuContent>{children}</DropdownMenuContent>
    </DropdownMenu>
  )
}

function FolderTile({
  node,
  folders,
  onOpen,
  onRename,
  onNewSubfolder,
  onDelete,
  onMove,
}: {
  node: BookmarkNode
  folders: FlatFolder[]
  onOpen: () => void
  onRename: () => void
  onNewSubfolder: () => void
  onDelete: () => void
  onMove: (parentId: string) => void
}) {
  const count = node.children?.length ?? 0
  const glowProps = useTileGlowProps()

  return (
    <div className="group relative h-full cursor-pointer" onClick={onOpen}>
      <BorderGlow
        className="h-full"
        borderRadius={16}
        glowRadius={36}
        coneSpread={22}
        {...glowProps}
      >
        <div className="relative flex h-full flex-col gap-2 p-3 text-left text-[#1c1c1e] dark:text-white">
          <FolderOpen className="size-8 text-[#8e8e93] dark:text-white/70" />
          <div className="flex flex-col">
            <span className="truncate text-sm font-medium">{node.title || "(untitled)"}</span>
            <span className="text-xs text-[#8e8e93] dark:text-white/50">
              {count} item{count === 1 ? "" : "s"}
            </span>
          </div>

          <TileActionsMenu>
            <DropdownMenuItem onClick={deferred(onNewSubfolder)}>New subfolder</DropdownMenuItem>
            <DropdownMenuItem onClick={deferred(onRename)}>
              <Pencil /> Rename
            </DropdownMenuItem>
            <MoveToSubmenu folders={folders} excludeId={node.id} onMove={onMove} />
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={deferred(onDelete)}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </TileActionsMenu>
        </div>
      </BorderGlow>
    </div>
  )
}

function BookmarkTile({
  node,
  folders,
  onEdit,
  onDelete,
  onMove,
}: {
  node: BookmarkNode
  folders: FlatFolder[]
  onEdit: () => void
  onDelete: () => void
  onMove: (parentId: string) => void
}) {
  const [customIcon] = useCustomIcon(node.url ?? null)
  const icon = customIcon ?? (node.url ? faviconUrl(node.url) : undefined)
  const glowProps = useTileGlowProps()

  return (
    <a href={node.url} className="group relative block h-full">
      <BorderGlow
        className="h-full"
        borderRadius={16}
        glowRadius={36}
        coneSpread={22}
        {...glowProps}
      >
        <div className="relative flex h-full flex-col gap-2 p-3 text-[#1c1c1e] dark:text-white">
          {icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={icon} alt="" className="size-8 rounded" />
          ) : (
            <Folder className="size-8 text-[#8e8e93] dark:text-white/70" />
          )}
          <div className="flex flex-col">
            <span className="truncate text-sm font-medium">{node.title || node.url}</span>
            <span className="truncate text-xs text-[#8e8e93] dark:text-white/50">{node.url}</span>
          </div>

          <button
            type="button"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onEdit()
            }}
            className={cn(
              "absolute top-1.5 right-9 flex size-6 items-center justify-center rounded-md text-[#8e8e93] opacity-0 hover:bg-black/[0.04] hover:text-[#1c1c1e] group-hover:opacity-100 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
            )}
            aria-label="Edit bookmark"
          >
            <Pencil className="size-3.5" />
          </button>

          <TileActionsMenu>
            <DropdownMenuItem onClick={deferred(onEdit)}>
              <Pencil /> Edit
            </DropdownMenuItem>
            <MoveToSubmenu folders={folders} excludeId={node.id} onMove={onMove} />
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={deferred(onDelete)}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </TileActionsMenu>
        </div>
      </BorderGlow>
    </a>
  )
}
