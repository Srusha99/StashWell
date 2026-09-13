"use client"

import * as React from "react"

const STORAGE_KEY = "bm:hidden-folders"

function readStoredHidden(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : []
  } catch {
    return []
  }
}

function writeStoredHidden(ids: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch {
    // ignore write failures
  }
}

export function useHiddenFolders(): {
  hiddenIds: Set<string>
  hideFolder: (id: string) => void
  unhideFolder: (id: string) => void
} {
  const [hiddenIds, setHiddenIds] = React.useState<Set<string>>(() => new Set(readStoredHidden()))

  const hideFolder = React.useCallback((id: string) => {
    setHiddenIds((current) => {
      if (current.has(id)) return current
      const next = new Set(current)
      next.add(id)
      writeStoredHidden(Array.from(next))
      return next
    })
  }, [])

  const unhideFolder = React.useCallback((id: string) => {
    setHiddenIds((current) => {
      if (!current.has(id)) return current
      const next = new Set(current)
      next.delete(id)
      writeStoredHidden(Array.from(next))
      return next
    })
  }, [])

  return { hiddenIds, hideFolder, unhideFolder }
}
