export type BookmarkNode = chrome.bookmarks.BookmarkTreeNode

/**
 * The ids Chrome gives its permanent folders in a local-only profile. Not
 * reliable on their own: Chrome 134+ can keep a second, account-stored set of
 * permanent folders (signed in to a Google account) whose ids are anything. So
 * these are one tier of getBookmarksBar / getOtherBookmarks below - never a
 * findNode() target.
 */
export const BOOKMARKS_BAR_ID = "1"
export const OTHER_BOOKMARKS_ID = "2"

export function isFolder(node: BookmarkNode): boolean {
  return node.url === undefined
}

/* -------------------------------------------------------------------------- */
/* Permanent folder resolution                                                 */
/* -------------------------------------------------------------------------- */

type PermanentKind = "bookmarks-bar" | "other"

const PERMANENT: Record<PermanentKind, { legacyId: string; titles: string[]; index: number }> = {
  "bookmarks-bar": { legacyId: BOOKMARKS_BAR_ID, titles: ["bookmarks bar"], index: 0 },
  other: { legacyId: OTHER_BOOKMARKS_ID, titles: ["other bookmarks"], index: 1 },
}

/**
 * The tree root's folders. Only the browser can put a folder at this level -
 * neither the user nor an extension can - so every fallback below picks among
 * Chrome's own permanent folders and can never land on a user's folder.
 */
function permanentFolders(tree: BookmarkNode[]): BookmarkNode[] {
  return (tree[0]?.children ?? []).filter(isFolder)
}

/**
 * Whether getTree() has returned a real tree. It can come back empty while the
 * browser is still loading bookmarks at startup, and the provider's tree starts
 * as [] before the first read - both mean "loading", never "missing".
 */
export function isTreeHydrated(tree: BookmarkNode[]): boolean {
  return permanentFolders(tree).length > 0
}

/**
 * Of several folders of one kind (account + local), the one Chrome syncs to
 * the account, then one with contents, then the first. Syncing first because
 * it only changes when the user signs in or out - a choice based on contents
 * alone would flip the moment the empty one got its first bookmark.
 */
function preferred(candidates: BookmarkNode[]): BookmarkNode | null {
  return (
    candidates.find((node) => node.syncing === true) ??
    candidates.find((node) => (node.children?.length ?? 0) > 0) ??
    candidates[0] ??
    null
  )
}

/** Tiers 1-3: folderType, then the legacy id, then the English title. */
function matchPermanent(folders: BookmarkNode[], kind: PermanentKind): BookmarkNode[] {
  const typed = folders.filter((node) => node.folderType === kind)
  if (typed.length > 0) return typed

  // A Chrome that reports folderType reports it on every permanent folder, so
  // a typed folder of another kind (or a managed one) is never a fallback.
  const untyped = folders.filter((node) => node.folderType === undefined && !node.unmodifiable)
  const { legacyId, titles } = PERMANENT[kind]

  const byId = untyped.find((node) => node.id === legacyId)
  if (byId) return [byId]

  return untyped.filter((node) => titles.includes(node.title.trim().toLowerCase()))
}

/**
 * Resolves one of Chrome's permanent folders through four tiers - folderType,
 * legacy id, title, position - or null while the tree isn't loaded. The last
 * tier skips a folder an earlier tier already claims for the other kind, so
 * the bar and Other Bookmarks never resolve to the same folder.
 */
function resolvePermanent(tree: BookmarkNode[], kind: PermanentKind): BookmarkNode | null {
  const folders = permanentFolders(tree)
  if (folders.length === 0) return null

  const matched = preferred(matchPermanent(folders, kind))
  if (matched) return matched

  const otherKind: PermanentKind = kind === "bookmarks-bar" ? "other" : "bookmarks-bar"
  const claimed = new Set(matchPermanent(folders, otherKind).map((node) => node.id))
  const positional = folders[PERMANENT[kind].index]
  if (
    !positional ||
    claimed.has(positional.id) ||
    positional.folderType !== undefined ||
    positional.unmodifiable
  ) {
    return null
  }
  return positional
}

/** The Bookmarks Bar the Personal workspace shows. Null only while loading. */
export function getBookmarksBar(tree: BookmarkNode[]): BookmarkNode | null {
  return resolvePermanent(tree, "bookmarks-bar")
}

/** The Other Bookmarks folder new StashWell folders are created in. */
export function getOtherBookmarks(tree: BookmarkNode[]): BookmarkNode | null {
  return resolvePermanent(tree, "other")
}

/**
 * Every Other Bookmarks folder - both the account and the local one when
 * Chrome keeps two - for finding folders StashWell made in either.
 */
export function getAllOtherBookmarks(tree: BookmarkNode[]): BookmarkNode[] {
  const folders = permanentFolders(tree)
  const typed = folders.filter((node) => node.folderType === "other")
  if (typed.length > 0) return typed
  const resolved = getOtherBookmarks(tree)
  return resolved ? [resolved] : []
}

/** Whether a node is a Bookmarks Bar (either one, when Chrome keeps two). */
export function isBookmarksBar(node: BookmarkNode): boolean {
  if (node.folderType !== undefined) return node.folderType === "bookmarks-bar"
  return node.parentId === "0" && node.id === BOOKMARKS_BAR_ID
}

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

export function hasBookmarksApi(): boolean {
  return typeof chrome !== "undefined" && !!chrome.bookmarks
}

let warned = false
function warnUnavailable() {
  if (warned) return
  warned = true
  console.warn(
    "chrome.bookmarks is not available in this context (expected outside the extension, e.g. `next dev` in a regular browser tab)."
  )
}

export async function getTree(): Promise<BookmarkNode[]> {
  if (!hasBookmarksApi()) {
    warnUnavailable()
    return []
  }
  return chrome.bookmarks.getTree()
}

export async function createBookmark(options: {
  parentId: string
  title: string
  url: string
}): Promise<BookmarkNode | null> {
  if (!hasBookmarksApi()) {
    warnUnavailable()
    return null
  }
  return chrome.bookmarks.create(options)
}

export async function createFolder(options: {
  parentId: string
  title: string
}): Promise<BookmarkNode | null> {
  if (!hasBookmarksApi()) {
    warnUnavailable()
    return null
  }
  return chrome.bookmarks.create({ parentId: options.parentId, title: options.title })
}

export async function updateBookmark(
  id: string,
  changes: { title?: string; url?: string }
): Promise<BookmarkNode | null> {
  if (!hasBookmarksApi()) {
    warnUnavailable()
    return null
  }
  return chrome.bookmarks.update(id, changes)
}

export async function removeNode(id: string, isFolder: boolean): Promise<void> {
  if (!hasBookmarksApi()) {
    warnUnavailable()
    return
  }
  if (isFolder) {
    await chrome.bookmarks.removeTree(id)
  } else {
    await chrome.bookmarks.remove(id)
  }
}

export async function moveNode(
  id: string,
  destination: { parentId: string; index?: number }
): Promise<BookmarkNode | null> {
  if (!hasBookmarksApi()) {
    warnUnavailable()
    return null
  }
  return chrome.bookmarks.move(id, destination)
}

export function subscribeToChanges(callback: () => void): () => void {
  if (!hasBookmarksApi()) {
    warnUnavailable()
    return () => {}
  }

  const listener = () => callback()

  chrome.bookmarks.onCreated.addListener(listener)
  chrome.bookmarks.onRemoved.addListener(listener)
  chrome.bookmarks.onChanged.addListener(listener)
  chrome.bookmarks.onMoved.addListener(listener)
  chrome.bookmarks.onChildrenReordered.addListener(listener)
  chrome.bookmarks.onImportEnded.addListener(listener)

  return () => {
    chrome.bookmarks.onCreated.removeListener(listener)
    chrome.bookmarks.onRemoved.removeListener(listener)
    chrome.bookmarks.onChanged.removeListener(listener)
    chrome.bookmarks.onMoved.removeListener(listener)
    chrome.bookmarks.onChildrenReordered.removeListener(listener)
    chrome.bookmarks.onImportEnded.removeListener(listener)
  }
}
