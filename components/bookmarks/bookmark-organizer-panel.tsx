"use client"

import * as React from "react"
import { ChevronsDownUp, ChevronsUpDown, Eye, Folder } from "lucide-react"

import {
  BOOKMARKS_BAR_ID,
  type BookmarkNode,
  findNode,
  flattenFolders,
  isFolder,
} from "@/hooks/use-bookmarks"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { OrganizerTree } from "@/components/bookmarks/organizer-tree"
import {
  BookmarkFormDialog,
  type BookmarkFormMode,
  type BookmarkFormValues,
} from "@/components/bookmarks/bookmark-form-dialog"
import { ConfirmDeleteDialog } from "@/components/bookmarks/confirm-delete-dialog"

function collectFolderIds(nodes: BookmarkNode[]): string[] {
  const ids: string[] = []
  for (const node of nodes) {
    if (!isFolder(node)) continue
    ids.push(node.id)
    if (node.children) ids.push(...collectFolderIds(node.children))
  }
  return ids
}

function labelFor(root: BookmarkNode | null, id: string): string {
  if (id === BOOKMARKS_BAR_ID) return "Bookmarks Bar"
  return findNode(root ? [root] : [], id)?.title || "(untitled)"
}

interface FormDialogState {
  mode: BookmarkFormMode
  node: BookmarkNode | null
  parentId: string
}

export interface BookmarkOrganizerBookmarksApi {
  createBookmark: (options: { parentId: string; title: string; url: string }) => Promise<unknown>
  createFolder: (options: { parentId: string; title: string }) => Promise<unknown>
  updateBookmark: (id: string, changes: { title?: string; url?: string }) => Promise<unknown>
  removeNode: (id: string, isFolder: boolean) => Promise<void>
  moveNode: (id: string, destination: { parentId: string; index?: number }) => Promise<unknown>
  refresh: () => Promise<void>
}

export function BookmarkOrganizerPanel({
  root,
  initialRootId,
  bookmarks,
  hiddenIds,
  onUnhide,
}: {
  root: BookmarkNode | null
  initialRootId?: string
  bookmarks: BookmarkOrganizerBookmarksApi
  hiddenIds?: Set<string>
  onUnhide?: (id: string) => void
}) {
  const [rootFolderId, setRootFolderId] = React.useState<string | null>(initialRootId ?? null)
  const [foldersOnly, setFoldersOnly] = React.useState(false)
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set())
  const [formDialog, setFormDialog] = React.useState<FormDialogState | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<BookmarkNode | null>(null)

  const effectiveRootId = rootFolderId ?? root?.id ?? null
  const scopedRoot = root && effectiveRootId ? findNode([root], effectiveRootId) : null
  const scopedNodes = scopedRoot?.children ?? []

  const [lastResetKey, setLastResetKey] = React.useState<string | null>(null)
  if (effectiveRootId !== lastResetKey) {
    setLastResetKey(effectiveRootId)
    if (effectiveRootId) {
      setExpandedIds(new Set(scopedNodes.filter(isFolder).map((node) => node.id)))
    }
  }

  const folderOptions = React.useMemo(
    () => (root ? flattenFolders(root.children ?? []) : []),
    [root]
  )

  const hiddenList = React.useMemo(() => Array.from(hiddenIds ?? []), [hiddenIds])

  function toggleExpand(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function expandAll() {
    setExpandedIds(new Set(collectFolderIds(scopedNodes)))
  }

  function collapseAll() {
    setExpandedIds(new Set())
  }

  async function handleFormSubmit(values: BookmarkFormValues) {
    if (!formDialog) return

    if (formDialog.mode === "create-bookmark") {
      await bookmarks.createBookmark({
        parentId: formDialog.parentId,
        title: values.title,
        url: values.url ?? "",
      })
    } else if (formDialog.mode === "create-folder") {
      await bookmarks.createFolder({ parentId: formDialog.parentId, title: values.title })
    } else if (formDialog.mode === "edit" && formDialog.node) {
      await bookmarks.updateBookmark(formDialog.node.id, {
        title: values.title,
        url: values.url,
      })
    }
    await bookmarks.refresh()
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    await bookmarks.removeNode(deleteTarget.id, deleteTarget.url === undefined)
    await bookmarks.refresh()
  }

  async function handleMove(nodeId: string, destination: { parentId: string; index?: number }) {
    await bookmarks.moveNode(nodeId, destination)
    await bookmarks.refresh()
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Root folder</span>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" className="w-full justify-start" />}
            >
              {scopedRoot?.id === root?.id
                ? "Browser Root (all bookmarks)"
                : scopedRoot?.title || "(untitled)"}
            </DropdownMenuTrigger>
            <DropdownMenuContent className="max-h-64">
              <DropdownMenuRadioGroup
                value={effectiveRootId ?? undefined}
                onValueChange={(value) => setRootFolderId(value as string)}
              >
                {root && (
                  <DropdownMenuRadioItem value={root.id}>
                    Browser Root (all bookmarks)
                  </DropdownMenuRadioItem>
                )}
                {folderOptions.map(({ node, depth }) => (
                  <DropdownMenuRadioItem key={node.id} value={node.id}>
                    <span style={{ paddingLeft: `${depth * 12}px` }} className="truncate">
                      {node.title || "(untitled)"}
                    </span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="text-xs text-muted-foreground">
            Changes apply to the selected root subtree.
          </span>
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={foldersOnly} onCheckedChange={setFoldersOnly} />
            Folders Only
          </label>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={expandAll}>
              <ChevronsUpDown /> Expand All
            </Button>
            <Button variant="outline" size="sm" onClick={collapseAll}>
              <ChevronsDownUp /> Collapse All
            </Button>
          </div>
        </div>

        <div className="min-h-0 max-h-[60vh] overflow-y-auto rounded-lg bg-black/[0.03] p-2 dark:bg-black/20">
          {scopedNodes.length === 0 ? (
            <p className="p-2 text-sm text-muted-foreground">This folder is empty.</p>
          ) : (
            <OrganizerTree
              nodes={scopedNodes}
              foldersOnly={foldersOnly}
              expandedIds={expandedIds}
              onToggleExpand={toggleExpand}
              onRename={(node) => setFormDialog({ mode: "edit", node, parentId: node.parentId ?? "" })}
              onNewChild={(parentId) => setFormDialog({ mode: "create-folder", node: null, parentId })}
              onDelete={setDeleteTarget}
              onMove={handleMove}
            />
          )}
        </div>

        {onUnhide && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Hidden folders</span>
            {hiddenList.length === 0 ? (
              <p className="rounded-lg bg-black/[0.03] p-2 text-sm text-muted-foreground dark:bg-black/20">
                No folders are hidden from the dashboard.
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {hiddenList.map((id) => (
                  <div
                    key={id}
                    className="flex items-center gap-2 rounded-lg bg-black/[0.03] px-3 py-2 text-sm dark:bg-black/20"
                  >
                    <Folder className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{labelFor(root, id)}</span>
                    <Button variant="ghost" size="xs" onClick={() => onUnhide(id)}>
                      <Eye /> Unhide
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <BookmarkFormDialog
        mode={formDialog?.mode ?? null}
        node={formDialog?.node ?? null}
        onOpenChange={(open) => !open && setFormDialog(null)}
        onSubmit={handleFormSubmit}
      />

      <ConfirmDeleteDialog
        node={deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
      />
    </>
  )
}
