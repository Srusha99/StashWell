"use client"

import * as React from "react"

import { readHiddenFolders, writeHiddenFolders } from "@/lib/hidden-folders"

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

  // A render-phase setState above has not landed yet when this render reads the
  // set, so take the list for the workspace being asked about either way.
  const hiddenIds =
    state.workspaceId === workspaceId ? state.ids : new Set<string>()

  return { hiddenIds, hideFolder, unhideFolder }
}
