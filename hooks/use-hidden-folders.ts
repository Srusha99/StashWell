"use client"

import * as React from "react"

import { hiddenFoldersKey, readHiddenFolders, writeHiddenFolders } from "@/lib/hidden-folders"
import { subscribeLocalSettings } from "@/lib/local-setting-events"

function sameIds(a: Set<string>, b: string[]): boolean {
  return a.size === new Set(b).size && b.every((id) => a.has(id))
}

/**
 * Hidden dashboard folders, scoped to a workspace.
 *
 * Held once, above the workspace-keyed subtree, so the dashboard and the Settings
 * dialog share one list - two instances would not see each other's writes. That
 * means a workspace switch does not remount this hook, so the stored id is kept
 * alongside the set and a change re-reads during render (the same pattern
 * BookmarkManager uses for `initialFolderId`).
 */
export function useHiddenFolders(workspaceId: string): {
  hiddenIds: Set<string>
  hideFolder: (id: string) => void
  unhideFolder: (id: string) => void
  reloadHiddenFolders: () => void
} {
  const [state, setState] = React.useState<{
    workspaceId: string
    ids: Set<string>
  }>(() => ({
    workspaceId,
    ids: new Set(readHiddenFolders(workspaceId)),
  }))

  if (state.workspaceId !== workspaceId) {
    setState({ workspaceId, ids: new Set(readHiddenFolders(workspaceId)) })
  }

  const hideFolder = React.useCallback((id: string) => {
    setState((current) => {
      if (current.ids.has(id)) return current
      const ids = new Set(current.ids)
      ids.add(id)
      writeHiddenFolders(current.workspaceId, Array.from(ids))
      return { workspaceId: current.workspaceId, ids }
    })
  }, [])

  const unhideFolder = React.useCallback((id: string) => {
    setState((current) => {
      if (!current.ids.has(id)) return current
      const ids = new Set(current.ids)
      ids.delete(id)
      writeHiddenFolders(current.workspaceId, Array.from(ids))
      return { workspaceId: current.workspaceId, ids }
    })
  }, [])

  // For a write that didn't go through this hook: restoring a backup stores the
  // hidden list for the folders it recreated (lib/workspace-backup.ts).
  const reloadHiddenFolders = React.useCallback(() => {
    setState((current) => ({
      workspaceId: current.workspaceId,
      ids: new Set(readHiddenFolders(current.workspaceId)),
    }))
  }, [])

  // Another tab hiding a folder, or another device's list arriving through
  // sync (lib/dashboard-sync-layouts.ts). This hook's own writes land here too,
  // and are skipped because they already match.
  React.useEffect(() => {
    const key = hiddenFoldersKey(workspaceId)
    return subscribeLocalSettings((changed) => {
      if (changed !== key) return
      setState((current) => {
        if (current.workspaceId !== workspaceId) return current
        const ids = readHiddenFolders(workspaceId)
        return sameIds(current.ids, ids) ? current : { workspaceId, ids: new Set(ids) }
      })
    })
  }, [workspaceId])

  // A render-phase setState above has not landed yet when this render reads the
  // set, so take the list for the workspace being asked about either way.
  const hiddenIds =
    state.workspaceId === workspaceId ? state.ids : new Set<string>()

  return { hiddenIds, hideFolder, unhideFolder, reloadHiddenFolders }
}
