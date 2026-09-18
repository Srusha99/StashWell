"use client"

import * as React from "react"

import {
  BOOKMARKS_BAR_ID,
  type BookmarkNode,
  type FlatFolder,
  createBookmark,
  createFolder,
  findNode,
  flattenFolders,
  getPath,
  getTree,
  isFolder,
  moveNode,
  removeNode,
  subscribeToChanges,
  updateBookmark,
} from "@/lib/bookmarks"

// Re-exported so existing import sites keep working. The implementations moved
// to lib/bookmarks.ts so pure lib/ modules (workspace folder resolution) can
// use them without importing this "use client" module.
export type { BookmarkNode, FlatFolder }
export { BOOKMARKS_BAR_ID, findNode, flattenFolders, getPath, isFolder }

/**
 * Reads the bookmark subtree a single workspace owns.
 *
 * `rootFolderId` is the Chrome folder backing the workspace, and it is required
 * and non-nullable on purpose: `root` resolves to exactly that folder or to
 * null. There is deliberately no `?? tree[0]` / `?? findNode(tree, "1")`
 * fallback - that one line is how a workspace would silently start showing
 * another workspace's bookmarks. A null `root` is a state the UI renders as a
 * repair prompt, not something to paper over here.
 */
export function useBookmarks(rootFolderId: string) {
  const [tree, setTree] = React.useState<BookmarkNode[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [currentFolderId, setCurrentFolderId] = React.useState(rootFolderId)

  const refresh = React.useCallback(async () => {
    const nextTree = await getTree()
    setTree(nextTree)
    setIsLoading(false)
  }, [])

  React.useEffect(() => {
    let active = true

    async function load() {
      const nextTree = await getTree()
      if (!active) return
      setTree(nextTree)
      setIsLoading(false)
    }

    load()
    const unsubscribe = subscribeToChanges(load)

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const root = findNode(tree, rootFolderId)

  // currentFolderId can point at a node that no longer exists - deleted from
  // Chrome's own bookmark manager while this page was open - or at a folder
  // outside this workspace. Correct it here, during render, rather than in an
  // effect that resets the state: the derived id costs no extra render, and the
  // stored id going stale is harmless once nothing reads it directly.
  const requestedFolder = root ? findNode([root], currentFolderId) : null
  const currentFolder = requestedFolder ?? root
  const effectiveFolderId = currentFolder?.id ?? currentFolderId

  return {
    tree,
    root,
    isLoading,
    currentFolderId: effectiveFolderId,
    currentFolder,
    setCurrentFolderId,
    refresh,
    createBookmark,
    createFolder,
    updateBookmark,
    removeNode,
    moveNode,
  }
}
