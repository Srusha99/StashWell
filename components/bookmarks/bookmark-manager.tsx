"use client"

import * as React from "react"
import { ArrowLeft, ChevronRight, FolderPlus, Home, Plus, Search, Settings } from "lucide-react"

import {
  type BookmarkNode,
  flattenFolders,
  getPath,
  useBookmarks,
} from "@/hooks/use-bookmarks"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FolderTree } from "@/components/bookmarks/folder-tree"
import { BookmarkGrid } from "@/components/bookmarks/bookmark-grid"
import {
  BookmarkFormDialog,
  type BookmarkFormMode,
  type BookmarkFormValues,
} from "@/components/bookmarks/bookmark-form-dialog"
import { ConfirmDeleteDialog } from "@/components/bookmarks/confirm-delete-dialog"
import { BookmarkOrganizerDialog } from "@/components/bookmarks/bookmark-organizer-dialog"

interface FormDialogState {
  mode: BookmarkFormMode
  node: BookmarkNode | null
  parentId: string
}

export function BookmarkManager({
  initialFolderId,
  onBack,
}: {
  initialFolderId?: string
  onBack?: () => void
} = {}) {
  const bookmarks = useBookmarks()
  const [query, setQuery] = React.useState("")
  const [formDialog, setFormDialog] = React.useState<FormDialogState | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<BookmarkNode | null>(null)
  const [organizerOpen, setOrganizerOpen] = React.useState(false)
  const [appliedInitialFolderId, setAppliedInitialFolderId] = React.useState<string | null>(null)

  const { root, currentFolderId, currentFolder, setCurrentFolderId } = bookmarks

  if (initialFolderId && initialFolderId !== appliedInitialFolderId) {
    setAppliedInitialFolderId(initialFolderId)
    setCurrentFolderId(initialFolderId)
  }

  const path = React.useMemo(
    () => (root ? getPath(root, currentFolderId) : []),
    [root, currentFolderId]
  )

  const folders = React.useMemo(() => (root ? flattenFolders(root.children ?? []) : []), [root])

  const items = React.useMemo(() => {
    const children = currentFolder?.children ?? []
    if (!query.trim()) return children
    const q = query.trim().toLowerCase()
    return children.filter(
      (node) => node.title.toLowerCase().includes(q) || node.url?.toLowerCase().includes(q)
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
    <div className="relative flex h-screen w-screen flex-col overflow-hidden text-foreground">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/10 bg-black/30 px-4 backdrop-blur-md">
        {onBack && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-white/70 hover:bg-white/10 hover:text-white"
            onClick={onBack}
            aria-label="Back to dashboard"
          >
            <ArrowLeft />
          </Button>
        )}
        <h1 className="text-sm font-semibold whitespace-nowrap text-white">Bookmarks</h1>

        <div className="relative ml-2 max-w-sm flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-white/50" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search this folder"
            className="border-white/15 bg-white/5 pl-7 text-white placeholder:text-white/40"
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="border-white/15 bg-white/5 text-white hover:bg-white/10"
            onClick={() =>
              setFormDialog({ mode: "create-folder", node: null, parentId: currentFolderId })
            }
          >
            <FolderPlus /> New folder
          </Button>
          <Button
            size="sm"
            onClick={() =>
              setFormDialog({ mode: "create-bookmark", node: null, parentId: currentFolderId })
            }
          >
            <Plus /> New bookmark
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            className="border-white/15 bg-white/5 text-white hover:bg-white/10"
            onClick={() => setOrganizerOpen(true)}
            aria-label="Bookmark Organizer"
          >
            <Settings />
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-56 shrink-0 overflow-y-auto border-r border-white/10 bg-black/20 p-2 backdrop-blur-md">
          <FolderTree
            nodes={root?.children ?? []}
            currentFolderId={currentFolderId}
            onSelect={setCurrentFolderId}
            onRename={(node) => setFormDialog({ mode: "edit", node, parentId: node.parentId ?? "" })}
            onNewSubfolder={(parentId) => setFormDialog({ mode: "create-folder", node: null, parentId })}
            onDelete={setDeleteTarget}
          />
        </aside>

        <main className="flex flex-1 flex-col overflow-y-auto">
          <div className="flex items-center gap-1 border-b border-white/10 bg-black/10 px-4 py-2 text-xs text-white/60 backdrop-blur-md">
            <Home className="size-3.5" />
            {path.map((node) => (
              <React.Fragment key={node.id}>
                <ChevronRight className="size-3 shrink-0" />
                <button
                  type="button"
                  onClick={() => setCurrentFolderId(node.id)}
                  className="truncate hover:text-white hover:underline"
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
            onEditFolder={(node) => setFormDialog({ mode: "edit", node, parentId: node.parentId ?? "" })}
            onNewSubfolder={(parentId) => setFormDialog({ mode: "create-folder", node: null, parentId })}
            onDeleteFolder={setDeleteTarget}
            onEditBookmark={(node) => setFormDialog({ mode: "edit", node, parentId: node.parentId ?? "" })}
            onDeleteBookmark={setDeleteTarget}
            onMove={handleMove}
          />
        </main>
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

      <BookmarkOrganizerDialog
        open={organizerOpen}
        onOpenChange={setOrganizerOpen}
        root={root}
        bookmarks={bookmarks}
      />
    </div>
  )
}
