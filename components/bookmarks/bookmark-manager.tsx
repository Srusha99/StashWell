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
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { BookmarkGrid } from "@/components/bookmarks/bookmark-grid"
import {
  BookmarkFormDialog,
  type BookmarkFormMode,
  type BookmarkFormValues,
} from "@/components/bookmarks/bookmark-form-dialog"
import { ConfirmDeleteDialog } from "@/components/bookmarks/confirm-delete-dialog"
import { HiddenFoldersDialog } from "@/components/bookmarks/hidden-folders-dialog"
import { BookmarkOrganizerPanel } from "@/components/bookmarks/bookmark-organizer-panel"
import { useWorkspaces } from "@/components/workspaces/workspace-provider"

interface FormDialogState {
  mode: BookmarkFormMode
  node: BookmarkNode | null
  parentId: string
}

type ManagerView = "grid" | "tree"

/**
 * The bookmark organiser: folder tree, grid/tree views and everything that edits
 * bookmarks.
 *
 * It fills whatever it is given rather than the screen - it is the Bookmarks
 * section of the Settings dialog, so the surrounding chrome (title, close, the
 * workspace switcher) belongs to the dialog and the dashboard, not here.
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
  const [managerView, setManagerView] = React.useState<ManagerView>("grid")
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

  return (
    <div className="flex h-full min-h-0 w-full text-foreground">
      <div className="flex min-h-0 flex-1">
        {/* No folder-tree sidebar: every navigation and folder action it
            offered (open, rename, new subfolder, hide, delete) already exists
            on the grid tiles and the breadcrumb below, so a second copy of the
            same tree was redundant next to it rather than adding anything. */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex h-11 shrink-0 items-center gap-2 border-b border-black/[0.06] bg-white/60 px-2.5 dark:border-white/10 dark:bg-black/10">
            {managerView === "grid" && (
              <div className="relative max-w-[260px] min-w-0 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-[#8e8e93] dark:text-white/50" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search this folder"
                  className="border-[#e5e5ea] bg-white pl-7 text-[#1c1c1e] placeholder:text-[#8e8e93] dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-white/40"
                />
              </div>
            )}

            <div className="ml-auto flex items-center gap-2">
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

              {managerView === "grid" && (
                <>
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
                </>
              )}

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
          </div>

          {managerView === "grid" ? (
            /* overflow-x-hidden because each tile's BorderGlow hangs 36px outside
               itself; letting it show puts a horizontal scrollbar across the pane
               for a purely decorative hover glow. */
            <main className="flex flex-1 flex-col overflow-x-hidden overflow-y-auto">
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
            </main>
          ) : (
            <main className="flex-1 overflow-y-auto p-4">
              <BookmarkOrganizerPanel
                root={root}
                bookmarks={bookmarks}
                hiddenIds={hiddenIds}
                onUnhide={onUnhideFolder}
              />
            </main>
          )}
        </div>
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
