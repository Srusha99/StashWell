"use client"

import * as React from "react"

import {
  type BookmarkNode,
  createBookmark,
  createFolder,
  getTree,
  moveNode,
  removeNode,
  subscribeToChanges,
  updateBookmark,
} from "@/lib/bookmarks"

export type { BookmarkNode }

export const BOOKMARKS_BAR_ID = "1"

export function findNode(nodes: BookmarkNode[], id: string): BookmarkNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children) {
      const found = findNode(node.children, id)
      if (found) return found
    }
  }
  return null
}

export function isFolder(node: BookmarkNode): boolean {
  return node.url === undefined
}

export interface FlatFolder {
  node: BookmarkNode
  depth: number
}

export function flattenFolders(nodes: BookmarkNode[], depth = 0): FlatFolder[] {
  const result: FlatFolder[] = []
  for (const node of nodes) {
    if (!isFolder(node)) continue
    result.push({ node, depth })
    if (node.children) {
      result.push(...flattenFolders(node.children, depth + 1))
    }
  }
  return result
}

export function getPath(root: BookmarkNode, folderId: string): BookmarkNode[] {
  const target = findNode([root], folderId)
  if (!target) return []

  const path: BookmarkNode[] = []
  let current: BookmarkNode | null = target
  while (current && current.id !== root.id) {
    path.unshift(current)
    current = current.parentId ? findNode([root], current.parentId) : null
  }
  return path
}

export function useBookmarks() {
  const [tree, setTree] = React.useState<BookmarkNode[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [currentFolderId, setCurrentFolderId] = React.useState(BOOKMARKS_BAR_ID)

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

  const root = tree[0] ?? null
  const currentFolder = root ? findNode([root], currentFolderId) : null

  return {
    tree,
    root,
    isLoading,
    currentFolderId,
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
