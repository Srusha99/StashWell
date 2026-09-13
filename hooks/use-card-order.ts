"use client"

import * as React from "react"

const STORAGE_KEY = "bm:dashboard-order"

function readStoredOrder(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : []
  } catch {
    return []
  }
}

function writeStoredOrder(order: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(order))
  } catch {
    // ignore write failures
  }
}

/** Merges a persisted/current order with the current default order: keeps
 * positions for ids that still exist, appends any new ids (in default
 * order), and drops ids that no longer exist. */
function reconcile(defaultOrder: string[], previous: string[]): string[] {
  const defaultSet = new Set(defaultOrder)
  const kept = previous.filter((id) => defaultSet.has(id))
  const keptSet = new Set(kept)
  const additions = defaultOrder.filter((id) => !keptSet.has(id))
  return [...kept, ...additions]
}

export function useCardOrder(
  defaultOrder: string[]
): [string[], (draggedId: string, targetId: string, position: "before" | "after") => void] {
  const key = defaultOrder.join(",")
  const storedOrderRef = React.useRef<string[] | null>(null)
  if (storedOrderRef.current === null) {
    storedOrderRef.current = readStoredOrder()
  }

  const [order, setOrder] = React.useState<string[]>(() =>
    reconcile(defaultOrder, storedOrderRef.current!)
  )
  const [lastKey, setLastKey] = React.useState(key)
  // defaultOrder is empty until bookmarks finish loading asynchronously, so the
  // first real reconciliation must still use the persisted order rather than
  // the (empty) current state, or a saved order is lost on every reload.
  const [hasHydrated, setHasHydrated] = React.useState(false)

  if (key !== lastKey) {
    setLastKey(key)
    setOrder((current) => reconcile(defaultOrder, hasHydrated ? current : storedOrderRef.current!))
    if (!hasHydrated) setHasHydrated(true)
  }

  function moveCard(draggedId: string, targetId: string, position: "before" | "after") {
    if (draggedId === targetId) return
    setOrder((current) => {
      const next = current.filter((id) => id !== draggedId)
      const targetIndex = next.indexOf(targetId)
      if (targetIndex === -1) return current
      const insertAt = position === "before" ? targetIndex : targetIndex + 1
      next.splice(insertAt, 0, draggedId)
      writeStoredOrder(next)
      return next
    })
  }

  return [order, moveCard]
}
