"use client"

import * as React from "react"

import {
  type FolderViewMode,
  folderViewModeKey,
  readFolderViewMode,
  writeFolderViewMode,
} from "@/lib/folder-view-mode"
import { subscribeLocalSettings } from "@/lib/local-setting-events"

export type { FolderViewMode }

export function useFolderViewMode(folderId: string): [FolderViewMode, (mode: FolderViewMode) => void] {
  const [mode, setMode] = React.useState<FolderViewMode>(() => readFolderViewMode(folderId))

  // Another tab switching this card, or another device's choice arriving
  // through sync (lib/dashboard-sync-layouts.ts).
  React.useEffect(() => {
    const key = folderViewModeKey(folderId)
    return subscribeLocalSettings((changed) => {
      if (changed === key) setMode(readFolderViewMode(folderId))
    })
  }, [folderId])

  const update = React.useCallback(
    (next: FolderViewMode) => {
      setMode(next)
      writeFolderViewMode(folderId, next)
    },
    [folderId]
  )

  return [mode, update]
}
