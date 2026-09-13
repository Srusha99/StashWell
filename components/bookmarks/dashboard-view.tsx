"use client"

import * as React from "react"
import { Settings } from "lucide-react"

import {
  BOOKMARKS_BAR_ID,
  type BookmarkNode,
  findNode,
  isFolder,
  useBookmarks,
} from "@/hooks/use-bookmarks"
import { useCardOrder } from "@/hooks/use-card-order"
import { useHiddenFolders } from "@/hooks/use-hidden-folders"
import { Button } from "@/components/ui/button"
import { DashboardHeader } from "@/components/bookmarks/dashboard-header"
import { FolderCard } from "@/components/bookmarks/folder-card"
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
  onOpenManager,
  onOpenSettings,
}: {
  onOpenManager: (folderId: string) => void
  onOpenSettings: () => void
}) {
  const bookmarks = useBookmarks()
  const { root } = bookmarks
  const { hiddenIds, hideFolder } = useHiddenFolders()

  const [formDialog, setFormDialog] = React.useState<FormDialogState | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<BookmarkNode | null>(null)
  const [organizerFolderId, setOrganizerFolderId] = React.useState<string | null>(null)
  const [draggedCardId, setDraggedCardId] = React.useState<string | null>(null)
  const [dropTarget, setDropTarget] = React.useState<{ id: string; position: "before" | "after" } | null>(
    null
  )

  const bar = root ? findNode([root], BOOKMARKS_BAR_ID) : null

  const cardsById = React.useMemo(() => {
    const map = new Map<string, CardData>()
    if (!bar) return map
    const children = bar.children ?? []
    const looseItems = children.filter((node) => !isFolder(node))
    const subfolders = children.filter(isFolder)
    map.set(bar.id, { id: bar.id, title: "Bookmarks Bar", node: null, items: looseItems })
    for (const folder of subfolders) {
      map.set(folder.id, {
        id: folder.id,
        title: folder.title || "(untitled)",
        node: folder,
        items: folder.children ?? [],
      })
    }
    return map
  }, [bar])

  const defaultOrder = React.useMemo(() => Array.from(cardsById.keys()), [cardsById])
  const [cardOrder, moveCard] = useCardOrder(defaultOrder)
  const cards = cardOrder
    .map((id) => cardsById.get(id))
    .filter((card): card is CardData => !!card && !hiddenIds.has(card.id))

  function handleCardDrop(targetId: string) {
    if (!draggedCardId || !dropTarget) return
    moveCard(draggedCardId, targetId, dropTarget.position)
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

  return (
    <div className="h-screen w-screen overflow-y-auto p-6">
      <DashboardHeader />
      <div className="columns-1 gap-5 sm:columns-2 lg:columns-3 xl:columns-4">
        {cards.map((card) => (
          <FolderCard
            key={card.id}
            id={card.id}
            title={card.title}
            node={card.node}
            items={card.items}
            onEditBookmark={(node) =>
              setFormDialog({ mode: "edit", node, parentId: node.parentId ?? "" })
            }
            onDeleteBookmark={setDeleteTarget}
            onDrillInto={onOpenManager}
            onNewBookmark={(parentId) =>
              setFormDialog({ mode: "create-bookmark", node: null, parentId })
            }
            onOrganize={setOrganizerFolderId}
            onRename={(node) => setFormDialog({ mode: "edit", node, parentId: node.parentId ?? "" })}
            onDelete={setDeleteTarget}
            onHide={hideFolder}
            isDragging={draggedCardId === card.id}
            dropIndicator={dropTarget?.id === card.id ? dropTarget.position : null}
            onCardDragStart={() => setDraggedCardId(card.id)}
            onCardDragOver={(position) => {
              if (draggedCardId && draggedCardId !== card.id) {
                setDropTarget({ id: card.id, position })
              }
            }}
            onCardDragLeave={() => setDropTarget((current) => (current?.id === card.id ? null : current))}
            onCardDrop={() => handleCardDrop(card.id)}
            onCardDragEnd={() => {
              setDraggedCardId(null)
              setDropTarget(null)
            }}
          />
        ))}
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
        open={organizerFolderId !== null}
        onOpenChange={(open) => !open && setOrganizerFolderId(null)}
        root={root}
        initialRootId={organizerFolderId ?? undefined}
        bookmarks={bookmarks}
      />

      <Button
        variant="secondary"
        size="icon-lg"
        className="fixed right-6 bottom-6 rounded-full border border-white/15 bg-black/40 text-white shadow-lg backdrop-blur-md hover:bg-black/60"
        onClick={onOpenSettings}
        aria-label="Open manager settings"
        title="Manager settings"
      >
        <Settings />
      </Button>
    </div>
  )
}
