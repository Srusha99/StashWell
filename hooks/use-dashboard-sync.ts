"use client"

import * as React from "react"

import {
  BOOKMARK_SYNC_PREF_KEY,
  type BookmarkSyncPref,
  readBookmarkSyncPref,
} from "@/lib/bookmark-sync"
import { subscribeLocalSettings } from "@/lib/local-setting-events"
import {
  IDLE_SYNC_STATE,
  type SyncOptions,
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
  { syncSessions, bookmarks, live }: SyncOptions
): SyncState {
  React.useEffect(() => {
    if (!userId) return
    return startDashboardSync(userId, { syncSessions, bookmarks, live })
  }, [userId, syncSessions, bookmarks, live])

  return useSyncState()
}

function subscribeBookmarkSyncPref(listener: () => void): () => void {
  return subscribeLocalSettings((key) => {
    if (key === BOOKMARK_SYNC_PREF_KEY) listener()
  })
}

/** This device's "Sync Bookmarks" setting, kept current across tabs. */
export function useBookmarkSyncPref(): BookmarkSyncPref {
  return React.useSyncExternalStore(subscribeBookmarkSyncPref, readBookmarkSyncPref, () => null)
}

/** The current sync state, for UI that only displays it. */
export function useSyncState(): SyncState {
  return React.useSyncExternalStore(subscribeSyncState, getSyncState, () => IDLE_SYNC_STATE)
}
