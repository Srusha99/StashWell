/**
 * Duplicate-bookmark detection for the "Bookmark health" settings row. Scans
 * every bookmark in every folder (not just the active workspace - duplicate
 * URLs are a browser-wide hygiene issue, unlike the per-workspace backup
 * rows), grouped by a normalized URL.
 */

import { type BookmarkNode, isFolder } from "@/lib/bookmarks"

export interface FlatBookmark {
  node: BookmarkNode
  /** Ancestor folder titles, root to immediate parent, e.g. ["Work", "Reading list"]. */
  folderPath: string[]
}

export interface DuplicateGroup {
  /** The normalized URL every item in this group shares. */
  key: string
  items: FlatBookmark[]
}

/**
 * lowercase host, strip trailing slash, strip utm_* params, ignore #hash -
 * the two most common ways the "same" link ends up saved twice.
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.hash = ""
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (key.toLowerCase().startsWith("utm_")) parsed.searchParams.delete(key)
    }
    parsed.searchParams.sort()
    const path = parsed.pathname.replace(/\/+$/, "")
    return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${path}${
      parsed.search ? `?${parsed.searchParams.toString()}` : ""
    }`
  } catch {
    return url.trim().toLowerCase()
  }
}

/** Every leaf bookmark under `nodes`, with the folder titles leading to it. */
export function flattenBookmarksWithPath(
  nodes: BookmarkNode[],
  folderPath: string[] = []
): FlatBookmark[] {
  const result: FlatBookmark[] = []
  for (const node of nodes) {
    if (isFolder(node)) {
      result.push(...flattenBookmarksWithPath(node.children ?? [], [...folderPath, node.title]))
    } else if (node.url) {
      result.push({ node, folderPath })
    }
  }
  return result
}

const CHUNK_SIZE = 200

/**
 * Chunks the scan via setTimeout so a large bookmark set still animates the
 * progress bar and can actually be interrupted by Cancel, even though the
 * underlying work (grouping already-loaded nodes in memory) is fast enough to
 * not need chunking for correctness.
 */
export async function scanForDuplicates(
  allBookmarks: FlatBookmark[],
  onProgress: (done: number, total: number) => void,
  isCancelled: () => boolean
): Promise<DuplicateGroup[] | null> {
  const groups = new Map<string, FlatBookmark[]>()
  const total = allBookmarks.length

  for (let i = 0; i < total; i += CHUNK_SIZE) {
    if (isCancelled()) return null

    const chunk = allBookmarks.slice(i, i + CHUNK_SIZE)
    for (const bookmark of chunk) {
      const key = normalizeUrl(bookmark.node.url!)
      const existing = groups.get(key)
      if (existing) existing.push(bookmark)
      else groups.set(key, [bookmark])
    }

    onProgress(Math.min(i + CHUNK_SIZE, total), total)
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  if (isCancelled()) return null

  return Array.from(groups.entries())
    .filter(([, items]) => items.length > 1)
    .map(([key, items]) => ({ key, items }))
}
