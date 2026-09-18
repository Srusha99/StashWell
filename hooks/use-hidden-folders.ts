"use client"

import * as React from "react"

import { readHiddenFolders, writeHiddenFolders } from "@/lib/hidden-folders"

/**
 * Hidden dashboard folders, scoped to a workspace.
 *
 * The dashboard subtree is keyed by workspace id, so a switch remounts this
 * hook and the lazy initializer below re-reads the new workspace's list.
 */
export function useHiddenFolders(workspaceId: string): {
  hiddenIds: Set<string>
  hideFolder: (id: string) => void
  unhideFolder: (id: string) => void
} {
  const [hiddenIds, setHiddenIds] = React.useState<Set<string>>(
    () => new Set(readHiddenFolders(workspaceId))
  )

  const hideFolder = React.useCallback(
    (id: string) => {
      setHiddenIds((current) => {
        if (current.has(id)) return current
        const next = new Set(current)
        next.add(id)
        writeHiddenFolders(workspaceId, Array.from(next))
        return next
      })
    },
    [workspaceId]
  )

  const unhideFolder = React.useCallback(
    (id: string) => {
      setHiddenIds((current) => {
        if (!current.has(id)) return current
        const next = new Set(current)
        next.delete(id)
        writeHiddenFolders(workspaceId, Array.from(next))
        return next
      })
    },
    [workspaceId]
  )

  return { hiddenIds, hideFolder, unhideFolder }
}
