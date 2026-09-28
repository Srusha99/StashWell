"use client"

import * as React from "react"
import { Folder, FolderInput } from "lucide-react"

import { type BookmarkNode, findNode, flattenFolders } from "@/hooks/use-bookmarks"
import { copyFolderTree, uniqueChildTitle } from "@/lib/bookmark-copy"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

function containsNode(node: BookmarkNode, id: string): boolean {
  if (node.id === id) return true
  return (node.children ?? []).some((child) => containsNode(child, id))
}

/**
 * Folder picker over the *entire* bookmark tree (every workspace, Bookmarks
 * Bar, Other Bookmarks) so the user can pull any existing folder into the
 * active workspace as a new section. Excludes the active workspace's own
 * folder and its descendants - importing a workspace into itself is
 * meaningless.
 */
export function ImportFromBrowserDialog({
  open,
  onOpenChange,
  tree,
  excludeFolderId,
  destRoot,
  onImported,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The full multi-root tree from useBookmarks (already fetched - no extra getTree() call). */
  tree: BookmarkNode[]
  excludeFolderId: string
  /** The active workspace's root folder - copyFolderTree's destination, and where uniqueChildTitle checks for name collisions. */
  destRoot: BookmarkNode
  onImported: () => Promise<void> | void
}) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [isImporting, setIsImporting] = React.useState(false)

  const options = React.useMemo(() => {
    const excludeNode = findNode(tree, excludeFolderId)
    const all = flattenFolders(tree[0]?.children ?? tree)
    return excludeNode
      ? all.filter(({ node }) => !containsNode(excludeNode, node.id))
      : all
  }, [tree, excludeFolderId])

  const [lastOpenKey, setLastOpenKey] = React.useState(open)
  if (open !== lastOpenKey) {
    setLastOpenKey(open)
    if (!open) {
      setSelectedId(null)
      setIsImporting(false)
    }
  }

  async function handleImport() {
    const picked = options.find(({ node }) => node.id === selectedId)?.node
    if (!picked) return

    setIsImporting(true)
    try {
      const title = uniqueChildTitle(destRoot, picked.title)
      await copyFolderTree(picked, destRoot.id, title)
      await onImported()
      onOpenChange(false)
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import from browser</DialogTitle>
          <DialogDescription>
            Pick a folder to copy into this workspace as a new section.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-64 min-h-0 overflow-y-auto rounded-lg bg-black/[0.03] p-1 dark:bg-black/20">
          {options.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">
              No other folders to import from.
            </p>
          ) : (
            options.map(({ node, depth }) => (
              <button
                key={node.id}
                type="button"
                onClick={() => setSelectedId(node.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-black/[0.04] dark:hover:bg-white/10",
                  selectedId === node.id && "bg-primary/15"
                )}
                style={{ paddingLeft: `${depth * 16 + 8}px` }}
              >
                <Folder className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{node.title || "(untitled)"}</span>
              </button>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={!selectedId || isImporting}>
            <FolderInput /> {isImporting ? "Importing..." : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
