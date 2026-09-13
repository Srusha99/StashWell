"use client"

import * as React from "react"
import { ArrowLeft, Bookmark, ChevronRight, EyeOff, FolderPlus, Home, LayoutGrid, Library, ListTree, Palette, Plus, Search } from "lucide-react"

import {
  type BookmarkNode,
  flattenFolders,
  getPath,
  useBookmarks,
} from "@/hooks/use-bookmarks"
import { useHiddenFolders } from "@/hooks/use-hidden-folders"
import { useAppearanceSettings } from "@/hooks/use-appearance-settings"
import { cn } from "@/lib/utils"
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
import { HiddenFoldersDialog } from "@/components/bookmarks/hidden-folders-dialog"
import { BookmarkOrganizerPanel } from "@/components/bookmarks/bookmark-organizer-panel"
import { AppearancePanel } from "@/components/bookmarks/appearance-panel"

interface FormDialogState {
  mode: BookmarkFormMode
  node: BookmarkNode | null
  parentId: string
}

type ManagerTab = "manager" | "appearance"
type ManagerView = "grid" | "tree"

const NAV_TABS: { id: ManagerTab; label: string; icon: typeof Bookmark }[] = [
  { id: "manager", label: "Bookmark Manager", icon: Bookmark },
  { id: "appearance", label: "Appearance", icon: Palette },
]

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
  const [activeTab, setActiveTab] = React.useState<ManagerTab>("manager")
  const [managerView, setManagerView] = React.useState<ManagerView>("grid")
  const [rootExpanded, setRootExpanded] = React.useState(true)
  const [hiddenFoldersOpen, setHiddenFoldersOpen] = React.useState(false)
  const [appliedInitialFolderId, setAppliedInitialFolderId] = React.useState<string | null>(null)
  const { hiddenIds, hideFolder, unhideFolder } = useHiddenFolders()
  const appearance = useAppearanceSettings()

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
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-white/10 bg-black/20 p-2 backdrop-blur-md">
          <nav className="flex flex-col gap-1">
            {NAV_TABS.map((tab) => (
              <React.Fragment key={tab.id}>
                <button
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    activeTab === tab.id
                      ? "bg-white/10 text-white"
                      : "text-white/60 hover:bg-white/5 hover:text-white"
                  )}
                >
                  <tab.icon className="size-4 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </button>

                {tab.id === "manager" && activeTab === "manager" && (
                  <div className="flex flex-col gap-0.5 pl-4">
                    <div
                      className={cn(
                        "group flex items-center gap-1 rounded-md pr-1 text-sm text-white/80 hover:bg-white/10",
                        root && currentFolderId === root.id && "bg-white/15 font-medium text-white"
                      )}
                      style={{ paddingLeft: "4px" }}
                    >
                      <button
                        type="button"
                        onClick={() => setRootExpanded((value) => !value)}
                        className="flex size-5 shrink-0 items-center justify-center rounded text-white/50"
                        aria-label={rootExpanded ? "Collapse" : "Expand"}
                      >
                        <ChevronRight
                          className={cn("size-3.5 transition-transform", rootExpanded && "rotate-90")}
                        />
                      </button>

                      <button
                        type="button"
                        onClick={() => root && setCurrentFolderId(root.id)}
                        className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left"
                      >
                        <Library className="size-3.5 shrink-0 text-white/50" />
                        <span className="truncate">All Bookmarks</span>
                      </button>
                    </div>

                    {rootExpanded && (
                      <FolderTree
                        nodes={root?.children ?? []}
                        currentFolderId={currentFolderId}
                        depth={1}
                        onSelect={setCurrentFolderId}
                        onRename={(node) => setFormDialog({ mode: "edit", node, parentId: node.parentId ?? "" })}
                        onNewSubfolder={(parentId) => setFormDialog({ mode: "create-folder", node: null, parentId })}
                        onDelete={setDeleteTarget}
                        onHide={hideFolder}
                      />
                    )}
                  </div>
                )}
              </React.Fragment>
            ))}
          </nav>
        </aside>

        {activeTab === "manager" && (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex h-14 shrink-0 items-center gap-3 border-b border-white/10 bg-black/10 px-4 backdrop-blur-md">
              {managerView === "grid" && (
                <div className="relative max-w-sm flex-1">
                  <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-white/50" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search this folder"
                    className="border-white/15 bg-white/5 pl-7 text-white placeholder:text-white/40"
                  />
                </div>
              )}

              <div className="ml-auto flex items-center gap-2">
                <div className="flex items-center gap-0.5 rounded-lg border border-white/15 bg-white/5 p-0.5">
                  <Button
                    variant={managerView === "grid" ? "secondary" : "ghost"}
                    size="icon-sm"
                    className={
                      managerView === "grid"
                        ? "text-white"
                        : "text-white/60 hover:bg-white/10 hover:text-white"
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
                        ? "text-white"
                        : "text-white/60 hover:bg-white/10 hover:text-white"
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
                  </>
                )}

                <Button
                  variant="outline"
                  size="icon-sm"
                  className="relative border-white/15 bg-white/5 text-white hover:bg-white/10"
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
            ) : (
              <main className="flex-1 overflow-y-auto p-6">
                <BookmarkOrganizerPanel
                  root={root}
                  bookmarks={bookmarks}
                  hiddenIds={hiddenIds}
                  onUnhide={unhideFolder}
                />
              </main>
            )}
          </div>
        )}

        {activeTab === "appearance" && (
          <main className="flex-1 overflow-y-auto p-6">
            <AppearancePanel
              settings={appearance.settings}
              onColorModeChange={appearance.setColorMode}
              onBackgroundEnabledChange={appearance.setBackgroundEnabled}
              onCursorGlowEnabledChange={appearance.setCursorGlowEnabled}
            />
          </main>
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

      <HiddenFoldersDialog
        open={hiddenFoldersOpen}
        onOpenChange={setHiddenFoldersOpen}
        root={root}
        hiddenIds={hiddenIds}
        onUnhide={unhideFolder}
      />
    </div>
  )
}
