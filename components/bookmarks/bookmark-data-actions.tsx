"use client"

import * as React from "react"
import { ArrowLeftRight, FolderInput, Stethoscope } from "lucide-react"

import { type BookmarkNode, createBookmark } from "@/lib/bookmarks"
import { parseNetscapeBookmarksHtml, copyImportTree } from "@/lib/bookmark-import"
import { readWorkspaceJson, writeWorkspaceJson } from "@/lib/workspace-storage"
import { Button } from "@/components/ui/button"
import { ImportFromBrowserDialog } from "@/components/bookmarks/import-from-browser-dialog"
import {
  BookmarkHealthDialog,
  type DeletedBookmarkRecord,
} from "@/components/bookmarks/bookmark-health-dialog"
import { UndoToast } from "@/components/bookmarks/undo-toast"

const LAST_CHECKED_KEY = "bookmark-health-last-checked"

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const diffMs = Date.now() - then
  const minutes = Math.round(diffMs / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`
  return new Date(iso).toLocaleDateString()
}

function DataRow({
  title,
  description,
  children,
}: {
  title: string
  description: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-3.5 last:border-b-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

/**
 * The three data-management rows below the Organiser section: import from the
 * browser or a competitor's export file, and a duplicate-bookmark health
 * check. Each row owns just the dialog state its action needs. Backing up and
 * restoring is the Privacy panel's job - one backup covers every workspace.
 */
export function BookmarkDataActions({
  workspace,
  tree,
  root,
  onRefresh,
}: {
  workspace: { id: string; name: string; folderId: string }
  /** Full multi-root tree from useBookmarks, already fetched. */
  tree: BookmarkNode[]
  /** The workspace's own folder node, resolved from `tree`. Caller renders this component only once it exists. */
  root: BookmarkNode
  onRefresh: () => Promise<void>
}) {
  const [importBrowserOpen, setImportBrowserOpen] = React.useState(false)
  const [healthOpen, setHealthOpen] = React.useState(false)
  const [importFileError, setImportFileError] = React.useState<string | null>(null)
  const [isImportingFile, setIsImportingFile] = React.useState(false)
  const [undoState, setUndoState] = React.useState<{
    message: string
    records: DeletedBookmarkRecord[]
  } | null>(null)
  const [lastCheckedAt, setLastCheckedAt] = React.useState<string | null>(null)

  const importFileInputRef = React.useRef<HTMLInputElement>(null)
  const undoTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const [lastCheckedWorkspaceId, setLastCheckedWorkspaceId] = React.useState<string | null>(null)
  if (workspace.id !== lastCheckedWorkspaceId) {
    setLastCheckedWorkspaceId(workspace.id)
    setLastCheckedAt(readWorkspaceJson<string | null>(workspace.id, LAST_CHECKED_KEY, null))
  }

  React.useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    }
  }, [])

  function handleScanned() {
    const now = new Date().toISOString()
    writeWorkspaceJson(workspace.id, LAST_CHECKED_KEY, now)
    setLastCheckedAt(now)
  }

  function showUndoToast(records: DeletedBookmarkRecord[]) {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    setUndoState({
      message: `Deleted ${records.length} bookmark${records.length === 1 ? "" : "s"}`,
      records,
    })
    undoTimerRef.current = setTimeout(() => setUndoState(null), 8000)
  }

  async function handleUndo() {
    if (!undoState) return
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    for (const record of undoState.records) {
      await createBookmark(record)
    }
    setUndoState(null)
    await onRefresh()
  }

  function handleImportFileClick() {
    setImportFileError(null)
    importFileInputRef.current?.click()
  }

  async function handleImportFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return

    setIsImportingFile(true)
    setImportFileError(null)
    try {
      const html = await file.text()
      const parsed = parseNetscapeBookmarksHtml(html)
      if (parsed.length === 0) {
        setImportFileError("Couldn't find any bookmarks in that file.")
        return
      }

      const folders = parsed.filter((node) => node.url === undefined)
      const loose = parsed.filter((node) => node.url !== undefined)
      const toImport = loose.length > 0
        ? [...folders, { title: "Imported bookmarks", children: loose }]
        : folders

      await copyImportTree(toImport, root.id)
      await onRefresh()
    } catch {
      setImportFileError("Couldn't read that file - is it a browser bookmarks export?")
    } finally {
      setIsImportingFile(false)
    }
  }

  return (
    <div className="flex flex-col">
      <DataRow title="Import from browser" description="Pull your existing Chrome bookmarks into a section.">
        <Button variant="outline" size="sm" onClick={() => setImportBrowserOpen(true)}>
          <FolderInput /> Import
        </Button>
      </DataRow>

      <DataRow
        title="Move from another app"
        description={
          importFileError ?? "Import an export file from Toby, Workona, Raindrop, Pocket or any browser. Folders become sections."
        }
      >
        <Button variant="outline" size="sm" onClick={handleImportFileClick} disabled={isImportingFile}>
          <ArrowLeftRight /> {isImportingFile ? "Importing..." : "Choose file"}
        </Button>
        <input
          ref={importFileInputRef}
          type="file"
          accept=".html,.htm"
          className="hidden"
          onChange={handleImportFileChange}
        />
      </DataRow>

      <DataRow
        title="Bookmark health"
        description={
          lastCheckedAt
            ? `Find duplicate bookmarks. Last checked: ${formatRelativeTime(lastCheckedAt)}`
            : "Find duplicate bookmarks."
        }
      >
        <Button variant="outline" size="sm" onClick={() => setHealthOpen(true)}>
          <Stethoscope /> Run check
        </Button>
      </DataRow>

      <ImportFromBrowserDialog
        open={importBrowserOpen}
        onOpenChange={setImportBrowserOpen}
        tree={tree}
        excludeFolderId={workspace.folderId}
        destRoot={root}
        onImported={onRefresh}
      />

      <BookmarkHealthDialog
        open={healthOpen}
        onOpenChange={setHealthOpen}
        tree={tree}
        onScanned={handleScanned}
        onDeleted={(records) => {
          showUndoToast(records)
          void onRefresh()
        }}
      />

      {undoState && (
        <UndoToast
          message={undoState.message}
          onUndo={handleUndo}
          onDismiss={() => setUndoState(null)}
        />
      )}
    </div>
  )
}
