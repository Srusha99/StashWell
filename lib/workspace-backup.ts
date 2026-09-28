/**
 * Export/restore for a single workspace's bookmark folder - the "Export
 * workspace" / "Restore from file" settings rows. Deliberately separate from
 * lib/privacy-data.ts's app-wide "Export My Data" (tasks + sessions + every
 * bookmark): this is just the active workspace's folder tree.
 */

import { type BookmarkNode, removeNode } from "@/lib/bookmarks"
import { type ImportNode, copyImportTree } from "@/lib/bookmark-import"
import { downloadTextFile, slugifyFilename } from "@/lib/session-bundles"

export interface WorkspaceBackup {
  exportedAt: string
  version: 1
  workspace: { id: string; name: string }
  bookmarks: ImportNode[]
}

function toImportNode(node: BookmarkNode): ImportNode {
  if (node.url !== undefined) {
    return { title: node.title, url: node.url }
  }
  return { title: node.title, children: (node.children ?? []).map(toImportNode) }
}

/** Downloads the workspace's current bookmark tree as a JSON backup file. */
export function exportWorkspaceBookmarks(workspace: { id: string; name: string }, root: BookmarkNode): void {
  const payload: WorkspaceBackup = {
    exportedAt: new Date().toISOString(),
    version: 1,
    workspace,
    bookmarks: (root.children ?? []).map(toImportNode),
  }

  downloadTextFile(
    `${slugifyFilename(workspace.name)}-backup-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(payload, null, 2),
    "application/json"
  )
}

/** Validates a restored file's shape before anything gets deleted. */
export function parseWorkspaceBackup(jsonText: string): WorkspaceBackup | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    return null
  }

  if (typeof parsed !== "object" || parsed === null) return null
  const candidate = parsed as Partial<WorkspaceBackup>
  if (candidate.version !== 1 || !Array.isArray(candidate.bookmarks)) return null
  return candidate as WorkspaceBackup
}

/** Counts every bookmark and folder in a backup or a live subtree, for the confirm dialog's "N items" wording. */
export function countItems(nodes: (BookmarkNode | ImportNode)[]): number {
  let count = 0
  for (const node of nodes) {
    count += 1
    if (node.url === undefined) count += countItems(node.children ?? [])
  }
  return count
}

/**
 * Deletes every current top-level child of the workspace's root folder, then
 * recreates the backup's tree in its place. `root` must be the live
 * BookmarkNode for the workspace's folder (findNode(tree, workspace.folderId)).
 */
export async function restoreWorkspaceBookmarks(
  root: BookmarkNode,
  backup: WorkspaceBackup
): Promise<void> {
  for (const child of root.children ?? []) {
    await removeNode(child.id, child.url === undefined)
  }
  await copyImportTree(backup.bookmarks, root.id)
}
