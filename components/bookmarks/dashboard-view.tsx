"use client"

import * as React from "react"
import { Plus } from "lucide-react"

import {
  type BookmarkNode,
  isFolder,
  useBookmarks,
} from "@/hooks/use-bookmarks"
import { useCardColumns } from "@/hooks/use-card-columns"
import { CARD_SHELL } from "@/components/dashboard/dashboard-card"
import { DashboardHeader } from "@/components/bookmarks/dashboard-header"
import { FolderCard } from "@/components/bookmarks/folder-card"
import { WorkspaceSwitcher } from "@/components/workspaces/workspace-switcher"
import { UserMenu } from "@/components/auth/user-menu"
import { WhatsNewToast } from "@/components/dashboard/whats-new-toast"
import { ViewSwitcher, type ViewMode } from "@/components/dashboard/view-switcher"
import KanbanBoard from "@/components/spectrumui/kanbanboard"
import { WorkspaceRepairNotice } from "@/components/workspaces/workspace-repair-notice"
import { useWorkspaces } from "@/components/workspaces/workspace-provider"
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

interface CardData {
  id: string
  title: string
  node: BookmarkNode | null
  items: BookmarkNode[]
}

export function DashboardView({
  columnCount,
  columnCountReady,
  onOpenManager,
  onOpenSettings,
  hasUnread,
  onOpenWhatsNew,
  showWhatsNewToast,
  onDismissWhatsNewToast,
  hiddenIds,
  onHideFolder,
  greetingName,
  greetingEnabled,
  searchBarEnabled,
  use24HourClock,
}: {
  columnCount: number
  columnCountReady: boolean
  onOpenManager: (folderId: string) => void
  onOpenSettings: () => void
  hasUnread: boolean
  onOpenWhatsNew: () => void
  showWhatsNewToast: boolean
  onDismissWhatsNewToast: () => void
  hiddenIds: Set<string>
  onHideFolder: (id: string) => void
  greetingName: string
  greetingEnabled: boolean
  searchBarEnabled: boolean
  use24HourClock: boolean
}) {
  const { activeWorkspace, activeId, resolved, workspaceFolderIds, isReady } =
    useWorkspaces()
  const bookmarks = useBookmarks(activeWorkspace.folderId)
  const { root, isLoading: bookmarksLoading } = bookmarks

  const [formDialog, setFormDialog] = React.useState<FormDialogState | null>(
    null
  )
  const [deleteTarget, setDeleteTarget] = React.useState<BookmarkNode | null>(
    null
  )
  const [organizerFolderId, setOrganizerFolderId] = React.useState<
    string | null
  >(null)
  const [draggedCardId, setDraggedCardId] = React.useState<string | null>(null)
  const [dropTarget, setDropTarget] = React.useState<{
    columnIndex: number
    id: string | null
    position: "before" | "after"
  } | null>(null)
  const [currentView, setCurrentView] = React.useState<ViewMode>("grid")
  const kanbanButtonRef = React.useRef<HTMLButtonElement>(null)
  const [kanbanAnchor, setKanbanAnchor] = React.useState<{ top: number; right: number } | null>(
    null
  )

  // The popover's position is captured once, at the moment it opens, from the
  // toggle button's own screen position - it emerges from that specific
  // icon rather than from a fixed screen corner (which drifted onto the
  // avatar menu next to it once that button got its own icon-only layout).
  function handleViewChange(view: ViewMode) {
    if (view === "kanban") {
      const rect = kanbanButtonRef.current?.getBoundingClientRect()
      if (rect) {
        setKanbanAnchor({ top: rect.bottom + 8, right: window.innerWidth - rect.right })
      }
    }
    setCurrentView(view)
  }

  // `root` is already this workspace's folder - useBookmarks resolves it
  // exactly. It used to be the absolute tree root, so this looked up the
  // Bookmarks Bar inside it; doing that now would return null for every
  // workspace except the default one and blank the dashboard.
  const bar = root

  const cardsById = React.useMemo(() => {
    const map = new Map<string, CardData>()
    if (!bar) return map
    const children = bar.children ?? []
    const looseItems = children.filter((node) => !isFolder(node))
    // Skip any folder that is itself a workspace root: if one gets dragged onto
    // the Bookmarks Bar in Chrome's own manager it would otherwise show up as a
    // card here as well as being its own workspace.
    const subfolders = children.filter(
      (node) => isFolder(node) && !workspaceFolderIds.has(node.id)
    )
    map.set(bar.id, {
      id: bar.id,
      title: "Unsorted",
      node: null,
      items: looseItems,
    })
    for (const folder of subfolders) {
      map.set(folder.id, {
        id: folder.id,
        title: folder.title || "(untitled)",
        node: folder,
        items: folder.children ?? [],
      })
    }
    return map
  }, [bar, workspaceFolderIds])

  const defaultOrder = React.useMemo(
    () => Array.from(cardsById.keys()),
    [cardsById]
  )
  // Syncs to the user's other devices from storage - see
  // lib/dashboard-sync-layouts.ts for how card ids are matched across them.
  const [columns, moveCard, layoutReady] = useCardColumns(
    defaultOrder,
    columnCount,
    activeId,
    columnCountReady
  )
  // A stored layout from before notes/reminders were removed may still list
  // their ids alongside folder ids - cardsById.get returns undefined for
  // those now, so they're dropped here rather than rendered as blanks.
  const visibleColumns = columns.map((colIds) =>
    colIds
      .map((id) => cardsById.get(id))
      .filter((card): card is CardData => !!card && !hiddenIds.has(card.id))
  )

  function handleCardDrop(columnIndex: number, targetId: string | null) {
    if (!draggedCardId || !dropTarget) return
    moveCard(draggedCardId, columnIndex, targetId, dropTarget.position)
    setDraggedCardId(null)
    setDropTarget(null)
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
    await bookmarks.refresh()
  }

  // Every folder card shares the same drag wiring, which is what lets them be
  // reordered together in Grid view. List view calls this with no dragProps,
  // so it gets inert no-op fallbacks instead - the card stays visually
  // draggable but dropping it does nothing.
  function renderCard(
    card: CardData,
    dragProps?: {
      isDragging: boolean
      dropIndicator: "before" | "after" | null
      onCardDragStart: () => void
      onCardDragOver: (position: "before" | "after") => void
      onCardDragLeave: () => void
      onCardDrop: () => void
      onCardDragEnd: () => void
    }
  ) {
    return (
      <FolderCard
        key={card.id}
        id={card.id}
        title={card.title}
        node={card.node}
        items={card.items}
        onEditBookmark={(node) =>
          setFormDialog({
            mode: "edit",
            node,
            parentId: node.parentId ?? "",
          })
        }
        onDeleteBookmark={setDeleteTarget}
        onDrillInto={onOpenManager}
        onNewBookmark={(parentId) =>
          setFormDialog({
            mode: "create-bookmark",
            node: null,
            parentId,
          })
        }
        onOrganize={setOrganizerFolderId}
        onRename={(node) =>
          setFormDialog({
            mode: "edit",
            node,
            parentId: node.parentId ?? "",
          })
        }
        onDelete={setDeleteTarget}
        onHide={onHideFolder}
        isDragging={dragProps?.isDragging ?? false}
        dropIndicator={dragProps?.dropIndicator ?? null}
        onCardDragStart={dragProps?.onCardDragStart ?? (() => {})}
        onCardDragOver={dragProps?.onCardDragOver ?? (() => {})}
        onCardDragLeave={dragProps?.onCardDragLeave ?? (() => {})}
        onCardDrop={dragProps?.onCardDrop ?? (() => {})}
        onCardDragEnd={dragProps?.onCardDragEnd ?? (() => {})}
      />
    )
  }

  return (
    <div className="h-screen w-screen overflow-y-auto p-4">
      {/* Top-left corner, mirroring the fixed settings button in the opposite
          corner. z-40 keeps it under the z-50 menus and dialogs it opens. */}
      <WorkspaceSwitcher className="fixed top-4 left-4 z-40" />
      <div className="fixed top-4 right-4 z-40 flex items-center gap-2">
        <ViewSwitcher
          currentView={currentView}
          onViewChange={handleViewChange}
          buttonRef={kanbanButtonRef}
        />
        <UserMenu
          onOpenSettings={onOpenSettings}
          hasUnread={hasUnread}
          onOpenWhatsNew={onOpenWhatsNew}
        />
      </div>

      {showWhatsNewToast && (
        <WhatsNewToast
          onOpenWhatsNew={onOpenWhatsNew}
          onDismiss={onDismissWhatsNewToast}
        />
      )}

      <DashboardHeader
        greetingName={greetingName}
        greetingEnabled={greetingEnabled}
        searchBarEnabled={searchBarEnabled}
        use24HourClock={use24HourClock}
      />

      {/* Shown instead of the folder columns when the workspace's Chrome folder
          can't be resolved - never a fallback to another folder's contents.
          Gated on isReady too: the tree starts empty and only loads async, so
          resolved.status reads "missing-folder" for a frame on every load
          without this - a false positive, not a real repair prompt. */}
      {isReady && resolved.status !== "ok" && (
        <div className="mx-auto mb-4 w-full max-w-[840px]">
          <WorkspaceRepairNotice />
        </div>
      )}

      {/* Capped and centred rather than stretched edge to edge: with flex-1
          columns on a wide screen each card ballooned past 360px, which is what
          made the dashboard feel heavy. ~200px per column at 4 columns. */}
      <div className="mx-auto flex w-full max-w-[840px] gap-[var(--grid-gap)]">
        {bookmarksLoading || (root && !layoutReady) ? (
          // Chrome's bookmarks.getTree() or the saved layout hasn't resolved
          // yet - shown instead of an empty grid so that wait reads as
          // "loading", not "no bookmarks", and so cards appear once, already
          // in their saved places. Gated on `root` because a workspace whose
          // folder is missing has no cards to wait for (the repair notice
          // above covers it).
          Array.from({ length: Math.max(columnCount, 1) }).map((_, columnIndex) => (
            <div
              key={columnIndex}
              className="flex min-w-0 flex-1 flex-col gap-[var(--grid-gap)]"
            >
              <div className={CARD_SHELL + " h-32 animate-pulse"} />
            </div>
          ))
        ) : (
          visibleColumns.map((items, columnIndex) => (
            <div
              key={columnIndex}
              className="flex min-w-0 flex-1 flex-col gap-[var(--grid-gap)]"
            >
              {items.map((item) =>
                renderCard(item, {
                  isDragging: draggedCardId === item.id,
                  dropIndicator:
                    dropTarget?.id === item.id ? dropTarget.position : null,
                  onCardDragStart: () => setDraggedCardId(item.id),
                  onCardDragOver: (position) => {
                    if (draggedCardId && draggedCardId !== item.id) {
                      setDropTarget({ columnIndex, id: item.id, position })
                    }
                  },
                  onCardDragLeave: () =>
                    setDropTarget((current) =>
                      current?.id === item.id ? null : current
                    ),
                  onCardDrop: () => handleCardDrop(columnIndex, item.id),
                  onCardDragEnd: () => {
                    setDraggedCardId(null)
                    setDropTarget(null)
                  },
                })
              )}

              {draggedCardId && (
                <div
                  className="relative min-h-6 flex-1"
                  onDragOver={(event) => {
                    event.preventDefault()
                    setDropTarget({ columnIndex, id: null, position: "after" })
                  }}
                  onDragLeave={() =>
                    setDropTarget((current) =>
                      current?.columnIndex === columnIndex && current.id === null
                        ? null
                        : current
                    )
                  }
                  onDrop={(event) => {
                    event.preventDefault()
                    handleCardDrop(columnIndex, null)
                  }}
                >
                  {dropTarget?.columnIndex === columnIndex &&
                    dropTarget.id === null && (
                      <div className="absolute inset-x-2 top-0 h-0.5 rounded-full bg-primary" />
                    )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {root && (
        <button
          type="button"
          onClick={() =>
            setFormDialog({
              mode: "create-folder",
              node: null,
              parentId: root.id,
            })
          }
          className="mx-auto mt-4 flex items-center gap-1 text-[11px] text-[#8e8e93] transition-colors hover:text-[#1c1c1e] dark:text-white/40 dark:hover:text-white"
        >
          <Plus className="size-3" /> New section
        </button>
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

      <BookmarkOrganizerDialog
        open={organizerFolderId !== null}
        onOpenChange={(open) => !open && setOrganizerFolderId(null)}
        root={root}
        initialRootId={organizerFolderId ?? undefined}
        bookmarks={bookmarks}
      />

      {currentView === "kanban" && (
        <>
          {/* Click-outside-to-close backdrop, transparent so the dashboard
              stays visible behind the popover rather than being dimmed. */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setCurrentView("grid")}
          />
          <div
            style={{
              top: kanbanAnchor?.top ?? 52,
              right: kanbanAnchor?.right ?? 16,
            }}
            className="fixed z-50 max-h-[70vh] w-[min(640px,calc(100vw-3rem))] origin-top-right overflow-y-auto rounded-2xl border border-[var(--card-border)] bg-white p-4 shadow-2xl ring-1 ring-black/5 animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-150 dark:border-white/15 dark:bg-neutral-900 dark:ring-white/10"
            onClick={(event) => event.stopPropagation()}
          >
            <KanbanBoard />
          </div>
        </>
      )}
    </div>
  )
}
