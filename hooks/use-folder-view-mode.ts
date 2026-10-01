"use client"

import * as React from "react"

import {
  type FolderViewMode,
  readFolderViewMode,
  writeFolderViewMode,
} from "@/lib/folder-view-mode"

export type { FolderViewMode }

export function useFolderViewMode(folderId: string): [FolderViewMode, (mode: FolderViewMode) => void] {
  const [mode, setMode] = React.useState<FolderViewMode>(() => readFolderViewMode(folderId))

  const update = React.useCallback(
    (next: FolderViewMode) => {
      setMode(next)
      writeFolderViewMode(folderId, next)
    },
    [folderId]
  )

  return [mode, update]
}
