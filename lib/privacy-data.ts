/**
 * Backing logic for the Privacy settings panel's data actions - export a local
 * backup, and clear cached app data. (Restoring a backup lives with the file
 * format in lib/workspace-backup.ts.) Built entirely on existing
 * readers/writers from lib/kanban.ts, lib/session-bundles.ts and
 * lib/bookmarks.ts rather than touching chrome.storage.local directly for
 * data that already has an owner.
 */

import { STORAGE_KEY as KANBAN_STORAGE_KEY, readKanbanCards } from "@/lib/kanban"
import { findNode, getTree, isFolder } from "@/lib/bookmarks"
import {
  PENDING_SAVE_KEY,
  STORAGE_KEY as SESSIONS_STORAGE_KEY,
  readSessionBundles,
} from "@/lib/session-bundles"
import { type WorkspaceSnapshot, downloadBackup, snapshotWorkspace } from "@/lib/workspace-backup"
import type { Workspace } from "@/lib/workspaces"

function hasStorageApi(): boolean {
  return typeof chrome !== "undefined" && !!chrome.storage?.local
}

/**
 * Downloads a single JSON file with everything the user has stored locally:
 * every workspace's dashboard, the kanban board and saved sessions - the file
 * the panel's "Restore from backup" row reads back.
 */
export async function exportUserData(workspaces: Workspace[]): Promise<void> {
  const [tasks, sessions, tree] = await Promise.all([
    readKanbanCards(),
    readSessionBundles(),
    getTree(),
  ])

  const workspaceFolderIds = new Set(workspaces.map((workspace) => workspace.folderId))
  const snapshots: WorkspaceSnapshot[] = []
  for (const workspace of workspaces) {
    const root = findNode(tree, workspace.folderId)
    // A workspace whose folder is gone has nothing to back up - its
    // dashboard's repair notice is where that gets fixed.
    if (!root || !isFolder(root)) continue
    snapshots.push(await snapshotWorkspace(workspace, root, workspaceFolderIds))
  }

  downloadBackup(`stashwell-export-${new Date().toISOString().slice(0, 10)}.json`, {
    workspaces: snapshots,
    tasks,
    sessions,
  })
}

/**
 * Removes cached app data from chrome.storage.local: kanban cards, saved tab
 * sessions, the one-shot pending-save flag, and every workspace's dashboard
 * column layout. Deliberately leaves the Supabase auth token and appearance
 * settings alone - those aren't "cache" in the sense this button describes,
 * and wiping the auth token would silently sign the user out (that's already
 * its own explicit action in the avatar menu).
 */
export async function clearLocalCache(): Promise<void> {
  if (!hasStorageApi()) return

  const all = await chrome.storage.local.get(null)
  const keysToRemove = Object.keys(all).filter(
    (key) =>
      key === KANBAN_STORAGE_KEY ||
      key === SESSIONS_STORAGE_KEY ||
      key === PENDING_SAVE_KEY ||
      (key.startsWith("bm:ws:") && key.endsWith(":dashboard-columns"))
  )

  if (keysToRemove.length === 0) return
  await chrome.storage.local.remove(keysToRemove)
}
