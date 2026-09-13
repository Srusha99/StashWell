"use client"

import * as React from "react"

export type FolderViewMode = "list" | "grid"

function storageKey(folderId: string) {
  return `bm:view:${folderId}`
}

function readStoredMode(folderId: string): FolderViewMode {
  try {
    return window.localStorage.getItem(storageKey(folderId)) === "grid" ? "grid" : "list"
  } catch {
    return "list"
  }
}

export function useFolderViewMode(folderId: string): [FolderViewMode, (mode: FolderViewMode) => void] {
  const [mode, setMode] = React.useState<FolderViewMode>(() => readStoredMode(folderId))

  const update = React.useCallback(
    (next: FolderViewMode) => {
      setMode(next)
      try {
        window.localStorage.setItem(storageKey(folderId), next)
      } catch {
        // ignore write failures (e.g. storage disabled)
      }
    },
    [folderId]
  )

  return [mode, update]
}
