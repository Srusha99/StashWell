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
import { useCardColumns } from "@/hooks/use-card-columns"
import { useColumnCount } from "@/hooks/use-column-count"
import { useHiddenFolders } from "@/hooks/use-hidden-folders"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { DashboardHeader } from "@/components/bookmarks/dashboard-header"
import { FolderCard } from "@/components/bookmarks/folder-card"
import { AssistantPanel } from "@/components/assistant/assistant-panel"
import { WorkspaceSwitcher } from "@/components/workspaces/workspace-switcher"
import { WorkspaceRepairNotice } from "@/components/workspaces/workspace-repair-notice"
import { useWorkspaces } from "@/components/workspaces/workspace-provider"
import {
  BookmarkFormDialog,
  type BookmarkFormMode,
  type BookmarkFormValues,
} from "@/components/bookmarks/bookmark-form-dialog"
import { ConfirmDeleteDialog } from "@/components/bookmarks/confirm-delete-dialog"
import { BookmarkOrganizerDialog } from "@/components/bookmarks/bookmark-organizer-dialog"
import { type ComposeMode, useAssistant } from "@/hooks/use-assistant"
import { VoicePoweredOrb } from "@/components/VoicePoweredOrb"

/** Shared by the two floating buttons, so they can't drift apart visually. */
const FLOATING_BUTTON =
  "rounded-full border border-black/10 bg-white text-[#1c1c1e] shadow-[var(--shadow-soft)] backdrop-blur-md hover:bg-[#fafafa] dark:border-white/15 dark:bg-black/40 dark:text-white dark:shadow-lg dark:hover:bg-black/60"

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
  greetingName,
  greetingEnabled,
  searchBarEnabled,
}: {
  onOpenManager: (folderId: string) => void
  onOpenSettings: () => void
  greetingName: string
  greetingEnabled: boolean
  searchBarEnabled: boolean
}) {
  const bookmarks = useBookmarks()
  const { root } = bookmarks
  const { hiddenIds, hideFolder } = useHiddenFolders()

  const [formDialog, setFormDialog] = React.useState<FormDialogState | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<BookmarkNode | null>(null)
  const [organizerFolderId, setOrganizerFolderId] = React.useState<string | null>(null)
  const [draggedCardId, setDraggedCardId] = React.useState<string | null>(null)
  const [dropTarget, setDropTarget] = React.useState<{
    columnIndex: number
    id: string | null
    position: "before" | "after"
  } | null>(null)

  // The assistant's state lives out here rather than inside the panel, so the
  // draft survives Escape-to-close and the notes/reminders hooks aren't torn down
  // every time the portal unmounts.
  const [assistantOpen, setAssistantOpen] = React.useState(false)
  const [draft, setDraft] = React.useState("")
  const [composeMode, setComposeMode] = React.useState<ComposeMode>(null)
  const assistant = useAssistant(activeId, greetingName)

  // The mode buttons are one-shot per send, and stale once the panel is closed.
  React.useEffect(() => {
    if (!assistantOpen) setComposeMode(null)
  }, [assistantOpen])

  function handleSend() {
    assistant.send(draft, composeMode)
    setDraft("")
    setComposeMode(null)
  }

  function handleModeChange(next: ComposeMode) {
    setComposeMode(next)
    if (next) assistant.announceMode(next)
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
  const [columns, moveCard] = useCardColumns(defaultOrder, columnCount, activeId)
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
      <DashboardHeader greetingName={greetingName} greetingEnabled={greetingEnabled} searchBarEnabled={searchBarEnabled} />

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
        {visibleColumns.map((cards, columnIndex) => (
          <div key={columnIndex} className="flex min-w-0 flex-1 flex-col gap-[var(--grid-gap)]">
            {cards.map((card) => {
              const dragProps = {
                isDragging: draggedCardId === card.id,
                dropIndicator: dropTarget?.id === card.id ? dropTarget.position : null,
                onCardDragStart: () => setDraggedCardId(card.id),
                onCardDragOver: (position: "before" | "after") => {
                  if (draggedCardId && draggedCardId !== card.id) {
                    setDropTarget({ columnIndex, id: card.id, position })
                  }
                },
                onCardDragLeave: () =>
                  setDropTarget((current) => (current?.id === card.id ? null : current)),
                onCardDrop: () => handleCardDrop(columnIndex, card.id),
                onCardDragEnd: () => {
                  setDraggedCardId(null)
                  setDropTarget(null)
                },
              }

              return (
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
                  onRename={(node) =>
                    setFormDialog({ mode: "edit", node, parentId: node.parentId ?? "" })
                  }
                  onDelete={setDeleteTarget}
                  onHide={hideFolder}
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
                    current?.columnIndex === columnIndex && current.id === null ? null : current
                  )
                }
                onDrop={(event) => {
                  event.preventDefault()
                  handleCardDrop(columnIndex, null)
                }}
              >
                {dropTarget?.columnIndex === columnIndex && dropTarget.id === null && (
                  <div className="absolute inset-x-2 top-0 h-0.5 rounded-full bg-primary" />
                )}
              </div>
            )}
          </div>
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

      {/* The card and both buttons share one bottom-anchored column, so the card
          grows upward from the launcher with no hand-tuned offset between them.
          items-end aligns the card's right edge with the buttons. */}
      <div className="fixed right-6 bottom-6 z-40 flex flex-col items-end gap-3">
        <AssistantPanel
          open={assistantOpen}
          onOpenChange={setAssistantOpen}
          messages={assistant.messages}
          draft={draft}
          onDraftChange={setDraft}
          onSend={handleSend}
          onUndo={assistant.undo}
          onClear={assistant.clear}
          greetingName={greetingName}
          mode={composeMode}
          onModeChange={handleModeChange}
          findReminderDueAt={(id) =>
            assistant.reminders.reminders.find((reminder) => reminder.id === id)?.dueAt ?? ""
          }
          onSetReminderTime={(id, dueAt) => assistant.reminders.updateReminder(id, { dueAt })}
          awaitingTimeId={assistant.awaitingTimeId}
          onAwaitingTimeHandled={assistant.clearAwaitingTime}
        />

        <div className="flex flex-col items-center gap-2">
          <Button
            variant="secondary"
            size="icon-lg"
            className={cn(FLOATING_BUTTON, "overflow-hidden border-transparent shadow-none dark:border-transparent")}
            onClick={() => setAssistantOpen((current) => !current)}
            aria-label="Open assistant"
            aria-expanded={assistantOpen}
            title="Assistant"
          >
            {/* Voice control deliberately off: this assistant only takes typed
                text, and requesting the microphone for a decorative launcher
                icon would pop a permission prompt with no purpose behind it.
                The orb still animates via its own idle-rotation fallback.
                aria-hidden goes on this wrapper, not the orb itself - it's a
                typed component with its own prop surface, not a div. */}
            <span aria-hidden className="pointer-events-none block h-full w-full">
              <VoicePoweredOrb enableVoiceControl={false} />
            </span>
          </Button>

          <Button
            variant="secondary"
            size="icon-lg"
            className={FLOATING_BUTTON}
            onClick={onOpenSettings}
            aria-label="Open manager settings"
            title="Manager settings"
          >
            <Settings />
          </Button>
        </div>
      </div>
    </div>
  )
}
