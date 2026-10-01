/**
 * Each dashboard card's list/grid choice, keyed by folder id. Lives here rather
 * than in hooks/use-folder-view-mode.ts so lib/workspace-backup.ts can save and
 * restore it without importing a "use client" module.
 */

export type FolderViewMode = "list" | "grid"

function storageKey(folderId: string) {
  return `bm:view:${folderId}`
}

export function readFolderViewMode(folderId: string): FolderViewMode {
  try {
    return window.localStorage.getItem(storageKey(folderId)) === "grid" ? "grid" : "list"
  } catch {
    return "list"
  }
}

export function writeFolderViewMode(folderId: string, mode: FolderViewMode): void {
  try {
    window.localStorage.setItem(storageKey(folderId), mode)
  } catch {
    // ignore write failures (e.g. storage disabled)
  }
}
