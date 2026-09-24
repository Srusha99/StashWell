"use client"

import * as React from "react"
import { Plus } from "lucide-react"

import {
  type BookmarkNode,
  isFolder,
  useBookmarks,
} from "@/hooks/use-bookmarks"
import { useCardColumns } from "@/hooks/use-card-columns"
import { DashboardHeader } from "@/components/bookmarks/dashboard-header"
import { FolderCard } from "@/components/bookmarks/folder-card"
import { NotesCard } from "@/components/dashboard/notes-card"
import { RemindersCard } from "@/components/dashboard/reminders-card"
import { WorkspaceSwitcher } from "@/components/workspaces/workspace-switcher"
import { UserMenu } from "@/components/auth/user-menu"
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

/**
 * Notes and reminders live in the same drag-and-drop columns as folder cards, so
 * they need ids in the same namespace. Prefixed to keep them clear of Chrome's
 * bookmark ids, which are plain numeric strings.
 */
const NOTES_CARD_ID = "stashwell:notes"
const REMINDERS_CARD_ID = "stashwell:reminders"

// Listed as separate members rather than `kind: "notes" | "reminders"` so
// TypeScript can narrow to the folder variant after the two early returns.
type DashboardItem =
  | { kind: "notes"; id: string }
  | { kind: "reminders"; id: string }
  | { kind: "folder"; id: string; card: CardData }

export function DashboardView({
  columnCount,
  onOpenManager,
  onOpenSettings,
  hiddenIds,
  onHideFolder,
  greetingName,
  greetingEnabled,
  searchBarEnabled,
  notesEnabled,
  remindersEnabled,
}: {
  columnCount: number
  onOpenManager: (folderId: string) => void
  onOpenSettings: () => void
  hiddenIds: Set<string>
  onHideFolder: (id: string) => void
  greetingName: string
  greetingEnabled: boolean
  searchBarEnabled: boolean
  notesEnabled: boolean
  remindersEnabled: boolean
}) {
  const { activeWorkspace, activeId, resolved, workspaceFolderIds } =
    useWorkspaces()
  const bookmarks = useBookmarks(activeWorkspace.folderId)
  const { root } = bookmarks

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

  // Notes and reminders come first so a fresh layout puts them in the leftmost
  // columns; an existing saved layout keeps whatever position the user dragged
  // them to (useCardColumns reconciles by id).
  const itemsById = React.useMemo(() => {
    const map = new Map<string, DashboardItem>()
    map.set(NOTES_CARD_ID, { kind: "notes", id: NOTES_CARD_ID })
    map.set(REMINDERS_CARD_ID, { kind: "reminders", id: REMINDERS_CARD_ID })
    for (const card of cardsById.values()) {
      map.set(card.id, { kind: "folder", id: card.id, card })
    }
    return map
  }, [cardsById])

  const defaultOrder = React.useMemo(
    () => Array.from(itemsById.keys()),
    [itemsById]
  )
  const [columns, moveCard] = useCardColumns(
    defaultOrder,
    columnCount,
    activeId
  )
  // Notes and reminders keep their ids in `defaultOrder`/`columns` even while
  // toggled off, the same way a hidden folder does - filtered only here, at
  // display time, so re-enabling one puts it back exactly where it was
  // dragged rather than at the end of the shortest column.
  const visibleColumns = columns.map((colIds) =>
    colIds
      .map((id) => itemsById.get(id))
      .filter((item): item is DashboardItem => {
        if (!item) return false
        if (item.kind === "folder") return !hiddenIds.has(item.id)
        if (item.kind === "notes") return notesEnabled
        return remindersEnabled
      })
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

  return (
    <div className="h-screen w-screen overflow-y-auto p-6">
      {/* Top-left corner, mirroring the fixed settings button in the opposite
          corner. z-40 keeps it under the z-50 menus and dialogs it opens. */}
      <WorkspaceSwitcher className="fixed top-6 left-6 z-40" />
      <UserMenu onOpenSettings={onOpenSettings} className="fixed top-6 right-6 z-40" />

      <DashboardHeader
        greetingName={greetingName}
        greetingEnabled={greetingEnabled}
        searchBarEnabled={searchBarEnabled}
      />

      {/* Shown instead of the folder columns when the workspace's Chrome folder
          can't be resolved - never a fallback to another folder's contents. */}
      {resolved.status !== "ok" && (
        <div className="mx-auto mb-4 w-full max-w-[960px]">
          <WorkspaceRepairNotice />
        </div>
      )}

      {/* Capped and centred rather than stretched edge to edge: with flex-1
          columns on a wide screen each card ballooned past 360px, which is what
          made the dashboard feel heavy. ~228px per column at 4 columns. */}
      <div className="mx-auto flex w-full max-w-[960px] gap-[var(--grid-gap)]">
        {visibleColumns.map((items, columnIndex) => (
          <div
            key={columnIndex}
            className="flex min-w-0 flex-1 flex-col gap-[var(--grid-gap)]"
          >
            {items.map((item) => {
              // Every card in a column - notes, reminders, folders - shares the
              // same drag wiring, which is what lets them be reordered together.
              const dragProps = {
                isDragging: draggedCardId === item.id,
                dropIndicator:
                  dropTarget?.id === item.id ? dropTarget.position : null,
                onCardDragStart: () => setDraggedCardId(item.id),
                onCardDragOver: (position: "before" | "after") => {
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
              }

              if (item.kind === "notes") {
                return (
                  <NotesCard
                    key={item.id}
                    workspaceId={activeId}
                    {...dragProps}
                  />
                )
              }
              if (item.kind === "reminders") {
                return (
                  <RemindersCard
                    key={item.id}
                    workspaceId={activeId}
                    {...dragProps}
                  />
                )
              }

              const card = item.card
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
                  {...dragProps}
                />
              )
            })}

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
        ))}
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
          className="mx-auto mt-5 flex items-center gap-1 text-[11px] text-[#8e8e93] transition-colors hover:text-[#1c1c1e] dark:text-white/40 dark:hover:text-white"
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

    </div>
  )
}
