"use client"

import * as React from "react"

import {
  readDashboardLayout,
  writeDashboardLayout,
  subscribeDashboardLayout,
  type Columns,
  type DashboardLayout,
} from "@/lib/dashboard-layout-storage"

export type { Columns }

function emptyColumns(count: number): Columns {
  return Array.from({ length: count }, () => [])
}

function shortestColumnIndex(columns: Columns): number {
  let shortest = 0
  for (let i = 1; i < columns.length; i++) {
    if (columns[i].length < columns[shortest].length) shortest = i
  }
  return shortest
}

/**
 * Keeps every card that still exists exactly where `previous` has it, drops the
 * ones that don't (and any duplicate), and appends brand-new cards to whichever
 * column is shortest. Nothing already placed ever moves.
 */
function placeCards(defaultIds: string[], previous: Columns): Columns {
  const present = new Set(defaultIds)
  const placed = new Set<string>()
  const columns = previous.map((col) =>
    col.filter((id) => {
      if (!present.has(id) || placed.has(id)) return false
      placed.add(id)
      return true
    })
  )
  for (const id of defaultIds) {
    if (!placed.has(id)) columns[shortestColumnIndex(columns)].push(id)
  }
  return columns
}

/**
 * Re-deals an arrangement into a different number of columns in reading order
 * - across each row, then down - so cards that sat near the top stay near the
 * top. Only ever used for display: the result is never saved over the source.
 */
function reflow(source: Columns, count: number): Columns {
  const columns = emptyColumns(count)
  const depth = Math.max(0, ...source.map((col) => col.length))
  let dealt = 0
  for (let row = 0; row < depth; row++) {
    for (const col of source) {
      if (row < col.length) columns[dealt++ % count].push(col[row])
    }
  }
  return columns
}

/**
 * This count's own saved arrangement if it has one; otherwise the most recently
 * hand-arranged count's, reflowed to fit; otherwise the bookmark order dealt
 * across the columns.
 *
 * Another device's arrangement arrives as just its primary count (see
 * lib/dashboard-sync-layouts.ts), so a screen with a different column count
 * shows it through the reflow - minus the cards this device doesn't have,
 * which would otherwise leave gaps in the dealing.
 */
function arrange(defaultIds: string[], layout: DashboardLayout | null, count: number): Columns {
  const own = layout?.byCount[count]
  if (own) return placeCards(defaultIds, own)
  const source = layout?.byCount[layout.primaryCount]
  if (!source) return placeCards(defaultIds, emptyColumns(count))
  const present = new Set(defaultIds)
  const known = source.map((col) => col.filter((id) => present.has(id)))
  return placeCards(defaultIds, reflow(known, count))
}

export function useCardColumns(
  defaultIds: string[],
  columnCount: number,
  workspaceId: string,
  columnCountReady: boolean
): [
  Columns,
  (draggedId: string, targetColumnIndex: number, targetId: string | null, position: "before" | "after") => void,
  boolean,
] {
  // Everything below assumes workspaceId is fixed for the lifetime of this
  // mount - the dashboard subtree is keyed by workspace id so a switch
  // remounts instead of re-rendering. If that key is ever removed, a moveCard
  // mid-transition would write the old workspace's layout under the new
  // workspace's key, so fail loudly in development rather than silently.
  const [mountWorkspaceId] = React.useState(workspaceId)
  if (process.env.NODE_ENV !== "production" && workspaceId !== mountWorkspaceId) {
    console.error(
      "useCardColumns: workspaceId changed without a remount - the dashboard subtree must be keyed by workspace id."
    )
  }

  const [layout, setLayout] = React.useState<DashboardLayout | null>(null)
  const [hasLoadedStorage, setHasLoadedStorage] = React.useState(false)
  // A failed read shows the default arrangement but must never be locked in -
  // the real layout may still be sitting in storage.
  const [readFailed, setReadFailed] = React.useState(false)
  // Set once onChanged has delivered a value, so the mount-time read - which
  // may resolve after it - can't replace a newer layout with an older one.
  const changedBeforeLoadRef = React.useRef(false)

  React.useEffect(() => {
    let active = true
    readDashboardLayout(workspaceId).then(
      (loaded) => {
        if (!active) return
        if (!changedBeforeLoadRef.current) setLayout(loaded)
        setHasLoadedStorage(true)
      },
      () => {
        if (!active) return
        setReadFailed(true)
        setHasLoadedStorage(true)
      }
    )
    return () => {
      active = false
    }
  }, [workspaceId])

  // Another open tab moving a card, a cloud backup being restored, or the
  // Privacy panel clearing the layout.
  React.useEffect(() => {
    return subscribeDashboardLayout(workspaceId, (loaded) => {
      changedBeforeLoadRef.current = true
      setLayout(loaded)
      setHasLoadedStorage(true)
    })
  }, [workspaceId])

  // Nothing is arranged until every input is final: the saved layout, the
  // bookmark ids, and the real column count (it starts at a placeholder 1 -
  // see hooks/use-column-count.ts). Showing a default arrangement in the
  // meantime is what made cards visibly jump into place on every load.
  const isReady = hasLoadedStorage && columnCountReady && defaultIds.length > 0

  // Derived, never stored separately: the same inputs always give the same
  // arrangement, however many times the page is loaded.
  const columns = React.useMemo(
    () => (isReady ? arrange(defaultIds, layout, columnCount) : emptyColumns(columnCount)),
    [isReady, defaultIds, layout, columnCount]
  )

  // Saves an arrangement the user didn't make by hand, in exactly two cases:
  //  - Nothing is saved yet: the first arrangement gets locked in, so a later
  //    reorder of the bookmarks in Chrome can't reshuffle it.
  //  - This count's own arrangement is missing a card (a new folder): the
  //    slot it was just given is kept, so it can't land somewhere else next
  //    load.
  // Never to drop a card that has gone - a tab whose bookmark tree is a moment
  // stale would otherwise erase one another tab just placed. And never for a
  // count shown by reflowing another count's arrangement: saving that would
  // pin a layout the user never made.
  React.useEffect(() => {
    if (!isReady) return

    let next: DashboardLayout
    if (!layout) {
      if (readFailed) return
      next = {
        byCount: { [columnCount]: columns },
        primaryCount: columnCount,
        arrangedByUser: false,
      }
    } else {
      const own = layout.byCount[columnCount]
      if (!own) return
      const known = new Set(own.flat())
      if (defaultIds.every((id) => known.has(id))) return
      next = {
        ...layout,
        // Unlike `columns`, keeps ids that are gone right now - see above.
        byCount: {
          ...layout.byCount,
          [columnCount]: own.map((col, i) => [
            ...col,
            ...(columns[i] ?? []).filter((id) => !known.has(id)),
          ]),
        },
      }
    }
    // Reaches this tab's state through subscribeDashboardLayout.
    void writeDashboardLayout(workspaceId, next)
  }, [isReady, readFailed, layout, columns, columnCount, defaultIds, workspaceId])

  function moveCard(
    draggedId: string,
    targetColumnIndex: number,
    targetId: string | null,
    position: "before" | "after"
  ) {
    if (!isReady) return
    const next = columns.map((col) => [...col])

    let originColumn = -1
    for (let i = 0; i < next.length; i++) {
      const idx = next[i].indexOf(draggedId)
      if (idx !== -1) {
        next[i].splice(idx, 1)
        originColumn = i
        break
      }
    }
    if (originColumn === -1) return

    const targetCol = next[targetColumnIndex]
    if (!targetCol) return

    let insertAt: number
    if (targetId === null) {
      insertAt = targetCol.length
    } else {
      const targetIndex = targetCol.indexOf(targetId)
      if (targetIndex === -1) return
      insertAt = position === "before" ? targetIndex : targetIndex + 1
    }
    targetCol.splice(insertAt, 0, draggedId)

    // Only this count's arrangement changes - every other count keeps its own.
    const saved: DashboardLayout = {
      byCount: { ...(layout?.byCount ?? {}), [columnCount]: next },
      primaryCount: columnCount,
      arrangedByUser: true,
    }
    setLayout(saved)
    // Reaches the user's other devices through lib/dashboard-sync-engine.ts,
    // which watches this storage key.
    void writeDashboardLayout(workspaceId, saved)
  }

  return [columns, moveCard, isReady]
}
