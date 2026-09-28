"use client"

import * as React from "react"
import {
  ChevronRight,
  EyeOff,
  FolderPlus,
  Home,
  LayoutGrid,
  ListTree,
  Plus,
  Search,
} from "lucide-react"

import {
  type BookmarkNode,
  flattenFolders,
  getPath,
  useBookmarks,
} from "@/hooks/use-bookmarks"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PaneHeader } from "@/components/settings/settings-parts"
import { BookmarkGrid } from "@/components/bookmarks/bookmark-grid"
import {
  BookmarkFormDialog,
  type BookmarkFormMode,
  type BookmarkFormValues,
} from "@/components/bookmarks/bookmark-form-dialog"
import { ConfirmDeleteDialog } from "@/components/bookmarks/confirm-delete-dialog"
import { HiddenFoldersDialog } from "@/components/bookmarks/hidden-folders-dialog"
import { BookmarkOrganizerPanel } from "@/components/bookmarks/bookmark-organizer-panel"
import { BookmarkDataActions } from "@/components/bookmarks/bookmark-data-actions"
import { useWorkspaces } from "@/components/workspaces/workspace-provider"

interface FormDialogState {
  mode: BookmarkFormMode
  node: BookmarkNode | null
  parentId: string
}

type ManagerView = "grid" | "tree"

/**
 * The Bookmarks settings page: an "Organiser" browser (folder tree/grid,
 * collapsed by default) plus the data-management rows below it (import,
 * health check, export/restore). Rendered inside the Settings dialog's
 * shared ScrollArea, same as every other section - it no longer fills the
 * dialog itself, so its own browser area is height-bounded rather than
 * open-ended.
 */
export function BookmarkManager({
  initialFolderId,
  hiddenIds,
  onHideFolder,
  onUnhideFolder,
}: {
  initialFolderId?: string
  hiddenIds: Set<string>
  onHideFolder: (id: string) => void
  onUnhideFolder: (id: string) => void
}) {
  const { activeWorkspace } = useWorkspaces()
  const bookmarks = useBookmarks(activeWorkspace.folderId)
  const [query, setQuery] = React.useState("")
  const [formDialog, setFormDialog] = React.useState<FormDialogState | null>(
    null
  )
  const [deleteTarget, setDeleteTarget] = React.useState<BookmarkNode | null>(
    null
  )
  const [managerView, setManagerView] = React.useState<ManagerView>("tree")
  const [organiserOpen, setOrganiserOpen] = React.useState(false)
  const [hiddenFoldersOpen, setHiddenFoldersOpen] = React.useState(false)
  const [appliedInitialFolderId, setAppliedInitialFolderId] = React.useState<
    string | null
  >(null)

  const { root, currentFolderId, currentFolder, setCurrentFolderId } = bookmarks

  if (initialFolderId && initialFolderId !== appliedInitialFolderId) {
    setAppliedInitialFolderId(initialFolderId)
    setCurrentFolderId(initialFolderId)
  }

  const path = React.useMemo(
    () => (root ? getPath(root, currentFolderId) : []),
    [root, currentFolderId]
  )

  const folders = React.useMemo(
    () => (root ? flattenFolders(root.children ?? []) : []),
    [root]
  )

  const items = React.useMemo(() => {
    const children = currentFolder?.children ?? []
    if (!query.trim()) return children
    const q = query.trim().toLowerCase()
    return children.filter(
      (node) =>
        node.title.toLowerCase().includes(q) ||
        node.url?.toLowerCase().includes(q)
    )
  }, [currentFolder, query])

  async function handleFormSubmit(values: BookmarkFormValues) {
    if (!formDialog) return

    if (formDialog.mode === "create-bookmark") {
      await bookmarks.createBookmark({
        parentId: formDialog.parentId,
        title: values.title,
        url: values.url ?? "",
      })
    } else if (formDialog.mode === "create-folder") {
      await bookmarks.createFolder({
        parentId: formDialog.parentId,
        title: values.title,
      })
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
    if (deleteTarget.id === currentFolderId && deleteTarget.parentId) {
      setCurrentFolderId(deleteTarget.parentId)
    }
    await bookmarks.refresh()
  }

  async function handleMove(nodeId: string, parentId: string) {
    await bookmarks.moveNode(nodeId, { parentId })
    await bookmarks.refresh()
  }

  // Shared between the grid header (alongside search/New folder/New bookmark)
  // and the tree view's "Root folder" row - tree view has nothing else to put
  // in a dedicated toolbar strip, so it sits next to that row instead of
  // floating in its own mostly-empty bar.
  const viewControls = (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-0.5 rounded-lg border border-[#e5e5ea] bg-white p-0.5 dark:border-white/15 dark:bg-white/5">
        <Button
          variant={managerView === "grid" ? "secondary" : "ghost"}
          size="icon-sm"
          className={
            managerView === "grid"
              ? "text-[#1c1c1e] dark:text-white"
              : "text-[#8e8e93] hover:bg-black/[0.04] hover:text-[#1c1c1e] dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white"
          }
          onClick={() => setManagerView("grid")}
          aria-label="Grid view"
          title="Grid view"
        >
          <LayoutGrid />
        </Button>
        <Button
          variant={managerView === "tree" ? "secondary" : "ghost"}
          size="icon-sm"
          className={
            managerView === "tree"
              ? "text-[#1c1c1e] dark:text-white"
              : "text-[#8e8e93] hover:bg-black/[0.04] hover:text-[#1c1c1e] dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white"
          }
          onClick={() => setManagerView("tree")}
          aria-label="Tree view"
          title="Tree view"
        >
          <ListTree />
        </Button>
      </div>

      <Button
        variant="outline"
        size="icon-sm"
        className="relative border-[#e5e5ea] bg-white text-[#1c1c1e] hover:bg-[#fafafa] dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
        onClick={() => setHiddenFoldersOpen(true)}
        aria-label="Hidden folders"
        title="Hidden folders"
      >
        <EyeOff />
        {hiddenIds.size > 0 && (
          <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] leading-none text-primary-foreground">
            {hiddenIds.size}
          </span>
        )}
      </Button>
    </div>
  )

  return (
    <div className="flex w-full flex-col gap-4 text-foreground">
      <PaneHeader title="Bookmarks" description="Import and manage your links." />

      <div className="flex flex-col overflow-hidden rounded-xl border border-border">
        {/* No folder-tree sidebar: every navigation and folder action it
            offered (open, rename, new subfolder, hide, delete) already exists
            on the grid tiles and the breadcrumb below, so a second copy of the
            same tree was redundant next to it rather than adding anything.
            No flex-1/height chain either - this box shrinks to whatever it's
            actually showing (one collapsed row, or the bounded scroll areas
            below) instead of always padding out to a fixed height. */}
        <div className="flex min-w-0 flex-col">
          {managerView === "grid" && (
            <div className="flex h-11 shrink-0 items-center gap-2 border-b border-black/[0.06] bg-white/60 px-4 dark:border-white/10 dark:bg-black/10">
              <div className="relative max-w-[260px] min-w-0 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-[#8e8e93] dark:text-white/50" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search this folder"
                  className="border-[#e5e5ea] bg-white pl-7 text-[#1c1c1e] placeholder:text-[#8e8e93] dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-white/40"
                />
              </div>

              <div className="ml-auto flex items-center gap-2">
                {viewControls}

                <Button
                  variant="outline"
                  size="sm"
                  className="border-[#e5e5ea] bg-white text-[#1c1c1e] hover:bg-[#fafafa] dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                  onClick={() =>
                    setFormDialog({
                      mode: "create-folder",
                      node: null,
                      parentId: currentFolderId,
                    })
                  }
                >
                  <FolderPlus /> New folder
                </Button>
                <Button
                  size="sm"
                  onClick={() =>
                    setFormDialog({
                      mode: "create-bookmark",
                      node: null,
                      parentId: currentFolderId,
                    })
                  }
                >
                  <Plus /> New bookmark
                </Button>
              </div>
            </div>
          )}

          {managerView === "grid" ? (
            <main className="flex flex-col">
              <div className="flex items-center gap-1 border-b border-black/[0.06] bg-white/60 px-2.5 py-1.5 text-[11px] text-[#8e8e93] dark:border-white/10 dark:bg-black/10 dark:text-white/60">
                <Home className="size-3.5" />
                {/* getPath returns [] for the workspace root itself, so the
                      top crumb has to be rendered explicitly or it vanishes. */}
                <button
                  type="button"
                  onClick={() => root && setCurrentFolderId(root.id)}
                  className="truncate hover:text-[#1c1c1e] hover:underline dark:hover:text-white"
                >
                  {activeWorkspace.name}
                </button>
                {path.map((node) => (
                  <React.Fragment key={node.id}>
                    <ChevronRight className="size-3 shrink-0" />
                    <button
                      type="button"
                      onClick={() => setCurrentFolderId(node.id)}
                      className="truncate hover:text-[#1c1c1e] hover:underline dark:hover:text-white"
                    >
                      {node.title || "(untitled)"}
                    </button>
                  </React.Fragment>
                ))}
              </div>

              <div className="max-h-[360px] overflow-y-auto">
                <BookmarkGrid
                  items={items}
                  folders={folders}
                  onOpenFolder={setCurrentFolderId}
                  onEditFolder={(node) =>
                    setFormDialog({
                      mode: "edit",
                      node,
                      parentId: node.parentId ?? "",
                    })
                  }
                  onNewSubfolder={(parentId) =>
                    setFormDialog({ mode: "create-folder", node: null, parentId })
                  }
                  onDeleteFolder={setDeleteTarget}
                  onHideFolder={onHideFolder}
                  onEditBookmark={(node) =>
                    setFormDialog({
                      mode: "edit",
                      node,
                      parentId: node.parentId ?? "",
                    })
                  }
                  onDeleteBookmark={setDeleteTarget}
                  onMove={handleMove}
                />
              </div>
            </main>
          ) : (
            <main className="p-3.5">
              <div
                className={cn(
                  "flex items-center justify-between gap-2",
                  organiserOpen && "mb-3"
                )}
              >
                <button
                  type="button"
                  onClick={() => setOrganiserOpen((open) => !open)}
                  aria-expanded={organiserOpen}
                  className="flex items-center gap-1.5 text-sm font-semibold text-foreground"
                >
                  <ChevronRight
                    className={cn(
                      "size-3.5 text-muted-foreground transition-transform",
                      organiserOpen && "rotate-90"
                    )}
                  />
                  Organiser
                </button>
                {viewControls}
              </div>
              {organiserOpen && (
                <BookmarkOrganizerPanel
                  root={root}
                  bookmarks={bookmarks}
                  hiddenIds={hiddenIds}
                  onUnhide={onUnhideFolder}
                />
              )}
            </main>
          )}
        </div>
      </div>

      {root && (
        <BookmarkDataActions
          workspace={{
            id: activeWorkspace.id,
            name: activeWorkspace.name,
            folderId: activeWorkspace.folderId,
          }}
          tree={bookmarks.tree}
          root={root}
          onRefresh={bookmarks.refresh}
        />
      )}

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

      <HiddenFoldersDialog
        open={hiddenFoldersOpen}
        onOpenChange={setHiddenFoldersOpen}
        root={root}
        hiddenIds={hiddenIds}
        onUnhide={onUnhideFolder}
      />
    </div>
  )
}
