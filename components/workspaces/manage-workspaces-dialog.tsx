"use client"

import * as React from "react"
import { Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react"

import { hasBookmarksApi } from "@/lib/bookmarks"
import { DEFAULT_EMOJI, DEFAULT_WORKSPACE_ID, type Workspace } from "@/lib/workspaces"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { EmojiPicker } from "@/components/workspaces/emoji-picker"
import { useWorkspaces } from "@/components/workspaces/workspace-provider"

export function ManageWorkspacesDialog({
  open,
  onOpenChange,
  startCreating = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  startCreating?: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open && (
          <ManageWorkspacesBody
            key={String(startCreating)}
            startCreating={startCreating}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ManageWorkspacesBody({
  startCreating,
  onClose,
}: {
  startCreating: boolean
  onClose: () => void
}) {
  const { workspaces, activeId, isBusy, switchTo, createWorkspace, updateWorkspace } =
    useWorkspaces()

  const [isCreating, setIsCreating] = React.useState(startCreating)
  const [newName, setNewName] = React.useState("")
  const [newEmoji, setNewEmoji] = React.useState(DEFAULT_EMOJI)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<Workspace | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const bookmarksAvailable = hasBookmarksApi()

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    const created = await createWorkspace({ name: newName, emoji: newEmoji })
    if (!created) {
      // The provider refuses to persist a workspace with no real Chrome folder
      // behind it, rather than leaving a broken record in localStorage.
      setError(
        bookmarksAvailable
          ? "Couldn't create the bookmark folder for this workspace. Try again."
          : "Bookmarks aren't available here, so a workspace folder can't be created. Open StashWell as the extension's New Tab page."
      )
      return
    }
    setNewName("")
    setNewEmoji(DEFAULT_EMOJI)
    setIsCreating(false)
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Workspaces</DialogTitle>
        <DialogDescription>
          Each workspace keeps its own bookmarks, notes, and reminders.
        </DialogDescription>
      </DialogHeader>

      <div className="flex max-h-80 flex-col gap-1 overflow-y-auto py-1">
        {workspaces.map((workspace) =>
          editingId === workspace.id ? (
            <WorkspaceEditRow
              key={workspace.id}
              workspace={workspace}
              onCancel={() => setEditingId(null)}
              onSave={async (patch) => {
                await updateWorkspace(workspace.id, patch)
                setEditingId(null)
              }}
            />
          ) : (
            <WorkspaceRow
              key={workspace.id}
              workspace={workspace}
              isActive={workspace.id === activeId}
              onSelect={() => switchTo(workspace.id)}
              onEdit={() => setEditingId(workspace.id)}
              onDelete={() => setDeleteTarget(workspace)}
            />
          )
        )}
      </div>

      {isCreating ? (
        <form onSubmit={handleCreate} className="flex flex-col gap-2 border-t pt-3">
          <span className="text-xs font-medium text-muted-foreground">New workspace</span>
          <div className="flex items-center gap-2">
            <EmojiPicker value={newEmoji} onChange={setNewEmoji} />
            <Input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Research"
              autoFocus
              required
              className="flex-1"
            />
            <Button type="submit" size="sm" disabled={isBusy || !newName.trim()}>
              {isBusy ? <Loader2 className="animate-spin" /> : <Check />} Create
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                setIsCreating(false)
                setError(null)
              }}
              aria-label="Cancel"
            >
              <X />
            </Button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          {!bookmarksAvailable && !error && (
            <p className="text-xs text-muted-foreground">
              Bookmarks aren&apos;t available in this context, so new workspaces can&apos;t be
              created here.
            </p>
          )}
        </form>
      ) : (
        <div className="border-t pt-3">
          <Button variant="outline" size="sm" onClick={() => setIsCreating(true)}>
            <Plus /> New workspace
          </Button>
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Done
        </Button>
      </DialogFooter>

      {/* Keyed on the target so the "also delete bookmarks" toggle resets to off
          for each workspace, the way BookmarkFormDialog keys its fields. */}
      <DeleteWorkspaceDialog
        key={deleteTarget?.id ?? "none"}
        workspace={deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      />
    </>
  )
}

function WorkspaceRow({
  workspace,
  isActive,
  onSelect,
  onEdit,
  onDelete,
}: {
  workspace: Workspace
  isActive: boolean
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const isDefault = workspace.id === DEFAULT_WORKSPACE_ID

  return (
    <div className="group flex items-center gap-2 rounded-lg px-1.5 py-1.5 hover:bg-accent/50">
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span aria-hidden className="flex size-5 shrink-0 items-center justify-center text-base leading-none">
          {workspace.emoji}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm">{workspace.name}</span>
        {isDefault && (
          <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            Bookmarks Bar
          </span>
        )}
        {isActive && <Check className="size-4 shrink-0 text-primary" />}
      </button>

      <Button variant="ghost" size="icon-xs" onClick={onEdit} aria-label={`Rename ${workspace.name}`}>
        <Pencil />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onDelete}
        // The Bookmarks-Bar-backed workspace is permanent: there must always be
        // somewhere to land, and removeTree("1") would target a root folder.
        disabled={isDefault}
        aria-label={isDefault ? "The default workspace can't be deleted" : `Delete ${workspace.name}`}
        title={isDefault ? "The default workspace can't be deleted" : "Delete workspace"}
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2 />
      </Button>
    </div>
  )
}

function WorkspaceEditRow({
  workspace,
  onCancel,
  onSave,
}: {
  workspace: Workspace
  onCancel: () => void
  onSave: (patch: { name: string; emoji: string }) => Promise<void>
}) {
  const [name, setName] = React.useState(workspace.name)
  const [emoji, setEmoji] = React.useState(workspace.emoji)
  const [isSaving, setIsSaving] = React.useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setIsSaving(true)
    try {
      await onSave({ name, emoji })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 rounded-lg bg-accent/40 p-1.5">
      <EmojiPicker value={emoji} onChange={setEmoji} />
      <Input
        value={name}
        onChange={(event) => setName(event.target.value)}
        autoFocus
        required
        className="flex-1"
      />
      <Button type="submit" size="icon-sm" disabled={isSaving || !name.trim()} aria-label="Save">
        {isSaving ? <Loader2 className="animate-spin" /> : <Check />}
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" onClick={onCancel} aria-label="Cancel">
        <X />
      </Button>
    </form>
  )
}

function DeleteWorkspaceDialog({
  workspace,
  onOpenChange,
}: {
  workspace: Workspace | null
  onOpenChange: (open: boolean) => void
}) {
  const { deleteWorkspace } = useWorkspaces()
  // Defaults to off: removeTree is irreversible and this UI offers no undo,
  // whereas leaving the folder in Chrome is always recoverable.
  const [deleteBookmarks, setDeleteBookmarks] = React.useState(false)
  const [isDeleting, setIsDeleting] = React.useState(false)

  if (!workspace) return null
  const target = workspace

  async function handleConfirm() {
    setIsDeleting(true)
    try {
      await deleteWorkspace(target.id, { deleteBookmarks })
      onOpenChange(false)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete &ldquo;{workspace.name}&rdquo;?</DialogTitle>
          <DialogDescription>
            Its notes and reminders will be permanently deleted.
          </DialogDescription>
        </DialogHeader>

        <label className="flex items-start gap-3 rounded-lg border p-3">
          <Switch
            checked={deleteBookmarks}
            onCheckedChange={setDeleteBookmarks}
            className="mt-0.5"
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm">Also delete its bookmarks</span>
            <span className="text-xs text-muted-foreground">
              {deleteBookmarks
                ? "The workspace's bookmark folder and everything in it will be removed from Chrome. This can't be undone."
                : "The bookmark folder stays in Chrome under Other Bookmarks, so you can still get to it."}
            </span>
          </span>
        </label>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={isDeleting}>
            {isDeleting ? "Deleting..." : "Delete workspace"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
