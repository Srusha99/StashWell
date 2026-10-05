"use client"

import * as React from "react"

import {
  IDLE_SYNC_STATE,
  type SyncState,
  type SyncStatus,
  getSyncState,
  startDashboardSync,
  subscribeSyncState,
} from "@/lib/dashboard-sync-engine"

export type { SyncState, SyncStatus }

/**
 * Keeps this user's dashboard - card arrangement, hidden cards, grid/list
 * views - plus saved sessions and tasks in step with their other devices for
 * as long as it's mounted (see lib/dashboard-sync-engine.ts). Mount it once,
 * above anything keyed by workspace - a workspace switch shouldn't restart
 * syncing.
 */
export function useDashboardSync(
  userId: string | null,
  { syncSessions }: { syncSessions: boolean }
): SyncState {
  React.useEffect(() => {
    if (!userId) return
    return startDashboardSync(userId, { syncSessions })
  }, [userId, syncSessions])

  return useSyncState()
}

/** The current sync state, for UI that only displays it. */
export function useSyncState(): SyncState {
  return React.useSyncExternalStore(subscribeSyncState, getSyncState, () => IDLE_SYNC_STATE)
}
