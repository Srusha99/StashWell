"use client"

import * as React from "react"

import {
  readDashboardLayout,
  writeDashboardLayout,
  subscribeDashboardLayout,
  type Columns,
} from "@/lib/dashboard-layout-storage"

export type { Columns }

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
  columnCount: number,
  workspaceId: string,
  columnCountReady: boolean
): [
  Columns,
  (draggedId: string, targetColumnIndex: number, targetId: string | null, position: "before" | "after") => void,
  boolean,
] {
  const key = defaultIds.join(",")

  // The hydration dance below assumes workspaceId is fixed for the lifetime of
  // this mount - the dashboard subtree is keyed by workspace id so a switch
  // remounts instead of re-rendering. If that key is ever removed, a moveCard
  // mid-transition would write the old workspace's layout under the new
  // workspace's key, so fail loudly in development rather than silently.
  const [mountWorkspaceId] = React.useState(workspaceId)
  if (process.env.NODE_ENV !== "production" && workspaceId !== mountWorkspaceId) {
    console.error(
      "useCardColumns: workspaceId changed without a remount - the dashboard subtree must be keyed by workspace id."
    )
  }

  // chrome.storage.local (unlike the window.localStorage this used before)
  // can only be read asynchronously, so there's no synchronous initial value
  // the way `readStored` used to provide one. `stored` starts null and is
  // filled in by the effect below; `hasLoadedStorage` distinguishes "loaded,
  // no saved layout" (stored stays null, load is done) from "still loading".
  const [stored, setStored] = React.useState<Columns | null>(null)
  const [hasLoadedStorage, setHasLoadedStorage] = React.useState(false)

  const [columns, setColumns] = React.useState<Columns>(() =>
    reconcile(defaultIds, null, columnCount)
  )
  const [lastKey, setLastKey] = React.useState(key)
  const [lastCount, setLastCount] = React.useState(columnCount)
  // defaultIds is empty until bookmarks finish loading asynchronously, and
  // stored is null until chrome.storage.local finishes loading, so the first
  // real reconciliation must wait for both and still use the persisted
  // columns rather than the (already-reconciled-from-nothing) current state,
  // or a saved layout is lost on reload.
  const [hasHydrated, setHasHydrated] = React.useState(false)

  // Read by the subscribeDashboardLayout effect below, which only runs once
  // per workspace mount and so can't close over defaultIds/columnCount
  // directly - kept current via an effect (never mutated during render) so
  // an onChanged event arriving between renders still reconciles against
  // the latest live values.
  const defaultIdsRef = React.useRef(defaultIds)
  const columnCountRef = React.useRef(columnCount)
  React.useEffect(() => {
    defaultIdsRef.current = defaultIds
    columnCountRef.current = columnCount
  }, [defaultIds, columnCount])

  React.useEffect(() => {
    let active = true
    readDashboardLayout(workspaceId).then((loaded) => {
      if (!active) return
      setStored(loaded)
      setHasLoadedStorage(true)
    })
    return () => {
      active = false
    }
  }, [workspaceId])

  // Picks up layout changes written elsewhere: another extension context
  // (popup vs. dashboard/newtab), or a Supabase pull landing after sign-in.
  // Reconciles immediately against the latest live ids/column count rather
  // than only updating `stored`, so a change that arrives after this hook
  // has already hydrated (and stopped consulting `stored`) still applies.
  React.useEffect(() => {
    return subscribeDashboardLayout(workspaceId, (loaded) => {
      setStored(loaded)
      setColumns(reconcile(defaultIdsRef.current, loaded, columnCountRef.current))
    })
  }, [workspaceId])

  // Every input hasHydrated's flip depends on - storage loaded, ids loaded,
  // and columnCount past its startup placeholder (see
  // hooks/use-column-count.ts) - must also gate the outer retry clause below
  // under the exact same name. If the outer clause could stay true for a
  // reason the flip doesn't check (or vice versa), whichever of these three
  // resolves last would leave `canHydrate && !hasHydrated` stuck true with
  // nothing left to change it: every render re-enters this block and calls
  // setColumns with a fresh array reference forever, an unbounded
  // render-phase update loop that throws "Too many re-renders" (React error
  // #301). Sharing one predicate makes that impossible - whenever it's true,
  // the flip below fires in the very same pass.
  const canHydrate = hasLoadedStorage && columnCountReady && defaultIds.length > 0

  if (key !== lastKey || columnCount !== lastCount || (canHydrate && !hasHydrated)) {
    setLastKey(key)
    setLastCount(columnCount)
    setColumns((current) => reconcile(defaultIds, hasHydrated ? current : stored, columnCount))
    if (!hasHydrated && canHydrate) setHasHydrated(true)
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
      void writeDashboardLayout(workspaceId, next)
      return next
    })
  }

  return [columns, moveCard, hasHydrated]
}
