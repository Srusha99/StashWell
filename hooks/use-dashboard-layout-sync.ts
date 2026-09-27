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
 * Skips the very first snapshot after a workspace mounts: that snapshot is
 * whatever useCardColumns just loaded (local or a fresh round-robin
 * default), not a user-caused change, so pushing it would just be an
 * unnecessary write-back of unchanged data.
 */
export function useDashboardLayoutSync(
  workspaceId: string,
  columns: Columns,
  titleOf: (id: string) => string
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
  }, [fingerprint, workspaceId])
}
