"use client"

import * as React from "react"

import { pushDashboardLayout, type LayoutEntry } from "@/lib/dashboard-layout-sync"
import type { Columns } from "@/lib/dashboard-layout-storage"

const PUSH_DEBOUNCE_MS = 800

function toEntries(columns: Columns, titleOf: (id: string) => string): LayoutEntry[] {
  const entries: LayoutEntry[] = []
  columns.forEach((col, columnIndex) => {
    col.forEach((id, position) => {
      entries.push({ id, title: titleOf(id), column: columnIndex, position })
    })
  })
  return entries
}

/**
 * Mirrors the dashboard's column layout to Supabase whenever it changes -
 * a drag-and-drop move, a card added/removed (reconciled in
 * hooks/use-card-columns.ts), or a title change flowing in from
 * chrome.bookmarks.onChanged via the caller's `titleOf`. Debounced so a
 * drag gesture or a burst of bookmark events pushes once, not per event.
 *
 * `ready` is useCardColumns' own `hasHydrated`: until that's true, `columns`
 * may still be churning through intermediate hydration states (waiting on
 * storage, default ids, or the real column count - see
 * hooks/use-column-count.ts), and none of those are user-caused changes.
 * Pushing one would write back a snapshot that isn't what's actually saved
 * (or worse, a transiently-scrambled one). The first snapshot seen once
 * `ready` flips true is the just-hydrated state, not a user change either,
 * so that one is skipped too - only changes after that get pushed.
 */
export function useDashboardLayoutSync(
  workspaceId: string,
  columns: Columns,
  titleOf: (id: string) => string,
  ready: boolean
): void {
  const skippedFirst = React.useRef(false)
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    skippedFirst.current = false
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [workspaceId])

  const fingerprint = React.useMemo(
    () => columns.map((col) => col.map((id) => `${id}:${titleOf(id)}`).join(",")).join("|"),
    [columns, titleOf]
  )

  React.useEffect(() => {
    if (!ready) return

    if (!skippedFirst.current) {
      skippedFirst.current = true
      return
    }

    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      pushDashboardLayout(workspaceId, toEntries(columns, titleOf))
    }, PUSH_DEBOUNCE_MS)

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fingerprint already captures every id/title columns depends on
  }, [fingerprint, workspaceId, ready])
}
