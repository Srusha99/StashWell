"use client"

import * as React from "react"
import { CheckCheck, Loader2, Trash2, X } from "lucide-react"

import { type BookmarkNode, removeNode } from "@/lib/bookmarks"
import {
  type DuplicateGroup,
  type FlatBookmark,
  flattenBookmarksWithPath,
  scanForDuplicates,
} from "@/lib/bookmark-health"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export interface DeletedBookmarkRecord {
  title: string
  url: string
  parentId: string
}

function oldestFirst(items: FlatBookmark[]): FlatBookmark[] {
  return [...items].sort((a, b) => (a.node.dateAdded ?? 0) - (b.node.dateAdded ?? 0))
}

/**
 * Scans every bookmark in every folder for duplicate URLs (progress bar +
 * Cancel while scanning, since a large bookmark set is chunked), then lets
 * the user review and delete duplicates group by group or in bulk.
 */
export function BookmarkHealthDialog({
  open,
  onOpenChange,
  tree,
  onScanned,
  onDeleted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tree: BookmarkNode[]
  /** Called once a scan finishes without being cancelled, so the caller can persist "Last checked". */
  onScanned: () => void
  /** Called with everything actually deleted, so the caller can offer Undo. */
  onDeleted: (records: DeletedBookmarkRecord[]) => void
}) {
  const [scanning, setScanning] = React.useState(false)
  const [progress, setProgress] = React.useState({ done: 0, total: 0 })
  const [groups, setGroups] = React.useState<DuplicateGroup[] | null>(null)
  const [dismissedKeys, setDismissedKeys] = React.useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [confirmingIds, setConfirmingIds] = React.useState<string[] | null>(null)
  const [isDeleting, setIsDeleting] = React.useState(false)
  const cancelledRef = React.useRef(false)

  const visibleGroups = React.useMemo(
    () => (groups ?? []).filter((group) => !dismissedKeys.has(group.key)),
    [groups, dismissedKeys]
  )

  // Resets everything at the start of each open/close transition, during
  // render rather than an effect - the actual scan (an async side effect)
  // still needs the effect below, but it can then assume a clean slate.
  const [lastOpenKey, setLastOpenKey] = React.useState(open)
  if (open !== lastOpenKey) {
    setLastOpenKey(open)
    setScanning(open)
    setGroups(null)
    setDismissedKeys(new Set())
    setSelectedIds(new Set())
    setConfirmingIds(null)
  }

  React.useEffect(() => {
    if (!open) return
    cancelledRef.current = false

    const all = flattenBookmarksWithPath(tree[0]?.children ?? tree)
    scanForDuplicates(
      all,
      (done, total) => setProgress({ done, total }),
      () => cancelledRef.current
    ).then((result) => {
      if (cancelledRef.current) return
      setScanning(false)
      if (result) {
        setGroups(result)
        onScanned()
      } else {
        onOpenChange(false)
      }
    })
    // Only re-run when the dialog opens - `tree` and the callbacks are
    // captured at that moment, matching a one-shot scan per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function handleCancelScan() {
    cancelledRef.current = true
    onOpenChange(false)
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSelectAll() {
    const next = new Set(selectedIds)
    for (const group of visibleGroups) {
      const [, ...rest] = oldestFirst(group.items)
      for (const item of rest) next.add(item.node.id)
    }
    setSelectedIds(next)
  }

  function handleKeepAll(group: DuplicateGroup) {
    setDismissedKeys((current) => new Set(current).add(group.key))
  }

  function handleKeepOne(group: DuplicateGroup) {
    const [, ...rest] = oldestFirst(group.items)
    setConfirmingIds(rest.map((item) => item.node.id))
  }

  function handleDeleteSelectedClick() {
    if (selectedIds.size === 0) return
    setConfirmingIds(Array.from(selectedIds))
  }

  async function handleConfirmDelete() {
    const ids = confirmingIds
    if (!ids || ids.length === 0) return

    setIsDeleting(true)
    try {
      const idSet = new Set(ids)
      const deleted: DeletedBookmarkRecord[] = []

      for (const group of groups ?? []) {
        for (const item of group.items) {
          if (idSet.has(item.node.id) && item.node.url) {
            deleted.push({
              title: item.node.title,
              url: item.node.url,
              parentId: item.node.parentId ?? "",
            })
          }
        }
      }

      for (const id of ids) {
        await removeNode(id, false)
      }

      setGroups((current) =>
        (current ?? [])
          .map((group) => ({
            ...group,
            items: group.items.filter((item) => !idSet.has(item.node.id)),
          }))
          .filter((group) => group.items.length > 1)
      )
      setSelectedIds((current) => {
        const next = new Set(current)
        for (const id of ids) next.delete(id)
        return next
      })
      setConfirmingIds(null)
      onDeleted(deleted)
    } finally {
      setIsDeleting(false)
    }
  }

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bookmark health</DialogTitle>
          <DialogDescription>
            {scanning
              ? "Scanning every bookmark for duplicates..."
              : "Duplicate bookmarks, grouped by link."}
          </DialogDescription>
        </DialogHeader>

        {scanning ? (
          <div className="flex flex-col gap-3 py-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {progress.done} / {progress.total} bookmarks checked
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={handleCancelScan}>
                Cancel
              </Button>
            </DialogFooter>
          </div>
        ) : visibleGroups.length === 0 ? (
          <>
            <p className="py-6 text-center text-sm text-muted-foreground">
              All good. No duplicates found.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {visibleGroups.length} duplicate {visibleGroups.length === 1 ? "link" : "links"}
              </span>
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="sm" onClick={handleSelectAll}>
                  <CheckCheck /> Select all
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteSelectedClick}
                  disabled={selectedIds.size === 0}
                >
                  <Trash2 /> Delete selected
                </Button>
              </div>
            </div>

            <div className="flex max-h-[50vh] min-h-0 flex-col gap-3 overflow-y-auto">
              {visibleGroups.map((group) => (
                <div key={group.key} className="rounded-lg border border-border p-2.5">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-muted-foreground">{group.key}</span>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button variant="ghost" size="xs" onClick={() => handleKeepOne(group)}>
                        Keep one
                      </Button>
                      <Button variant="ghost" size="xs" onClick={() => handleKeepAll(group)}>
                        Keep all
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    {group.items.map((item) => (
                      <label
                        key={item.node.id}
                        className="flex items-start gap-2 rounded-md px-1.5 py-1 hover:bg-black/[0.03] dark:hover:bg-white/5"
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.node.id)}
                          onChange={() => toggleSelected(item.node.id)}
                          className="mt-1 size-3.5 shrink-0 accent-primary"
                        />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-sm">{item.node.title || item.node.url}</span>
                          <span className="truncate text-[11px] text-muted-foreground">
                            {item.node.url}
                          </span>
                          <span className="truncate text-[11px] text-muted-foreground">
                            {item.folderPath.join(" / ") || "(root)"}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>

      <Dialog open={confirmingIds !== null} onOpenChange={(next) => !next && setConfirmingIds(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {confirmingIds?.length ?? 0} bookmark(s)?</DialogTitle>
            <DialogDescription>
              This can&apos;t be undone from here, but a brief Undo will appear right after.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmingIds(null)}>
              <X /> Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}
