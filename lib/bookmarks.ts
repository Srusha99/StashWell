export type BookmarkNode = chrome.bookmarks.BookmarkTreeNode

function hasBookmarksApi(): boolean {
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
