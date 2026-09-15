"use client"

import * as React from "react"

const STORAGE_KEY = "bm:dashboard-columns"

type Columns = string[][]

function readStored(): Columns | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    const valid = parsed.every(
      (col) => Array.isArray(col) && col.every((id) => typeof id === "string")
    )
    return valid ? (parsed as Columns) : null
  } catch {
    return null
  }
}

function writeStored(columns: Columns) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(columns))
  } catch {
    // ignore write failures
  }
}

function distributeRoundRobin(ids: string[], count: number): Columns {
  const columns: Columns = Array.from({ length: count }, () => [])
  ids.forEach((id, i) => columns[i % count].push(id))
  return columns
}

function shortestColumnIndex(columns: Columns): number {
  let shortest = 0
  for (let i = 1; i < columns.length; i++) {
    if (columns[i].length < columns[shortest].length) shortest = i
  }
  return shortest
}

/** Reconciles persisted columns with the current default id set: keeps each
 * surviving id in its own column/position, appends brand-new ids to
 * whichever column is currently shortest, and drops ids that no longer
 * exist. Only redistributes everything from scratch (round-robin) when the
 * column count itself changed, e.g. the viewport crossed a breakpoint - a
 * drag/drop reorder never touches columns other than the ones involved. */
function reconcile(defaultIds: string[], previous: Columns | null, count: number): Columns {
  const defaultSet = new Set(defaultIds)

  if (!previous || previous.length !== count) {
    const flat = previous ? previous.flat().filter((id) => defaultSet.has(id)) : []
    const flatSet = new Set(flat)
    const additions = defaultIds.filter((id) => !flatSet.has(id))
    return distributeRoundRobin([...flat, ...additions], count)
  }

  const kept = previous.map((col) => col.filter((id) => defaultSet.has(id)))
  const keptSet = new Set(kept.flat())
  const additions = defaultIds.filter((id) => !keptSet.has(id))
  for (const id of additions) {
    kept[shortestColumnIndex(kept)].push(id)
  }
  return kept
}

export function useCardColumns(
  defaultIds: string[],
  columnCount: number
): [
  Columns,
  (draggedId: string, targetColumnIndex: number, targetId: string | null, position: "before" | "after") => void,
] {
  const key = defaultIds.join(",")
  const [stored] = React.useState<Columns | null>(readStored)

  const [columns, setColumns] = React.useState<Columns>(() =>
    reconcile(defaultIds, stored, columnCount)
  )
  const [lastKey, setLastKey] = React.useState(key)
  const [lastCount, setLastCount] = React.useState(columnCount)
  // defaultIds is empty until bookmarks finish loading asynchronously, so the
  // first real reconciliation must still use the persisted columns rather
  // than the (empty) current state, or a saved layout is lost on reload.
  const [hasHydrated, setHasHydrated] = React.useState(false)

  if (key !== lastKey || columnCount !== lastCount) {
    setLastKey(key)
    setLastCount(columnCount)
    setColumns((current) => reconcile(defaultIds, hasHydrated ? current : stored, columnCount))
    // Only treat the persisted layout as consumed once bookmarks have
    // actually loaded - a columnCount-only change while defaultIds is still
    // empty (viewport resize firing before the async bookmark fetch resolves)
    // must not mark hydration as done, or the real reconciliation later
    // discards `stored` in favor of the empty `current`.
    if (!hasHydrated && defaultIds.length > 0) setHasHydrated(true)
  }

  function moveCard(
    draggedId: string,
    targetColumnIndex: number,
    targetId: string | null,
    position: "before" | "after"
  ) {
    setColumns((current) => {
      const next = current.map((col) => [...col])

      let originColumn = -1
      for (let i = 0; i < next.length; i++) {
        const idx = next[i].indexOf(draggedId)
        if (idx !== -1) {
          next[i].splice(idx, 1)
          originColumn = i
          break
        }
      }
      if (originColumn === -1) return current

      const targetCol = next[targetColumnIndex]
      if (!targetCol) return current

      let insertAt: number
      if (targetId === null) {
        insertAt = targetCol.length
      } else {
        const targetIndex = targetCol.indexOf(targetId)
        if (targetIndex === -1) return current
        insertAt = position === "before" ? targetIndex : targetIndex + 1
      }

      targetCol.splice(insertAt, 0, draggedId)
      writeStored(next)
      return next
    })
  }

  return [columns, moveCard]
}
