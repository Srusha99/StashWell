/**
 * Supabase access for the two synced rows each user has: `user_dashboards`
 * (layouts, sessions, tasks, appearance settings) and `user_bookmarks` (the
 * bookmarks the dashboard shows). Only reads and writes rows: deciding what to
 * send, and merging what comes back, is lib/dashboard-sync-engine.ts's job.
 *
 * Schema, RLS and the updated_at triggers:
 * supabase/migrations/20261005120000_user_dashboards.sql and
 * supabase/migrations/20261005160000_user_bookmarks_and_settings.sql; live
 * change events: supabase/migrations/20261007120000_sync_realtime.sql.
 */

import { supabase } from "@/lib/supabaseClient"

/** Long enough for a slow connection, short enough that a hung request can't
 * hold the sync lock (and every other tab's sync) indefinitely. */
const REQUEST_TIMEOUT_MS = 15_000

/** Unique violation: another device created this user's row first. */
const UNIQUE_VIOLATION = "23505"

export interface DashboardRow {
  workspace_layout: unknown
  session_bundles: unknown
  todos: unknown
  settings: unknown
  /** Also the row's version - see updateRow. */
  updated_at: string
}

export type DashboardPatch = Partial<
  Pick<DashboardRow, "workspace_layout" | "session_bundles" | "todos" | "settings">
>

export interface BookmarksRow {
  bookmark_tree: unknown
  updated_at: string
}

export type BookmarksPatch = Partial<Pick<BookmarksRow, "bookmark_tree">>

export class DashboardSyncError extends Error {
  constructor(
    message: string,
    readonly code?: string
  ) {
    super(message)
    this.name = "DashboardSyncError"
  }
}

function timeout(): AbortSignal {
  return AbortSignal.timeout(REQUEST_TIMEOUT_MS)
}

type Table = "user_dashboards" | "user_bookmarks"

/** This user's row, or null if they've never synced it. */
async function fetchRow<Row>(table: Table, columns: string, userId: string): Promise<Row | null> {
  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .eq("user_id", userId)
    .abortSignal(timeout())
    .maybeSingle<Row>()

  if (error) throw new DashboardSyncError(error.message, error.code)
  return data
}

/** Just the row's version (updated_at), to check for changes without downloading it. */
async function fetchVersion(table: Table, userId: string): Promise<string | null> {
  const row = await fetchRow<{ updated_at: string }>(table, "updated_at", userId)
  return row?.updated_at ?? null
}

/**
 * Creates this user's row and returns its version. Null when another device
 * created it in the meantime - fetch again and merge with that one instead.
 */
async function insertRow(table: Table, userId: string, patch: object): Promise<string | null> {
  const { data, error } = await supabase
    .from(table)
    .insert({ user_id: userId, ...patch })
    .select("updated_at")
    .abortSignal(timeout())

  if (!error) return (data?.[0] as { updated_at: string } | undefined)?.updated_at ?? null
  if (error.code === UNIQUE_VIOLATION) return null
  throw new DashboardSyncError(error.message, error.code)
}

/**
 * Saves `patch` only if the row is still the version this device read
 * (`expectedUpdatedAt`), and returns the new version. Null when another device
 * saved in between - fetch again and merge with its copy, rather than
 * overwriting it.
 */
async function updateRow(
  table: Table,
  userId: string,
  patch: object,
  expectedUpdatedAt: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from(table)
    .update(patch)
    .eq("user_id", userId)
    .eq("updated_at", expectedUpdatedAt)
    .select("updated_at")
    .abortSignal(timeout())

  if (error) throw new DashboardSyncError(error.message, error.code)
  return (data?.[0] as { updated_at: string } | undefined)?.updated_at ?? null
}

/**
 * Saves `patch` over `row` (or creates the row) and returns the row's new
 * version. Null when another device saved first.
 */
function saveRow(
  table: Table,
  userId: string,
  patch: object,
  row: { updated_at: string } | null
): Promise<string | null> {
  return row ? updateRow(table, userId, patch, row.updated_at) : insertRow(table, userId, patch)
}

export function fetchDashboard(userId: string): Promise<DashboardRow | null> {
  return fetchRow<DashboardRow>(
    "user_dashboards",
    "workspace_layout, session_bundles, todos, settings, updated_at",
    userId
  )
}

export function saveDashboard(
  userId: string,
  patch: DashboardPatch,
  row: DashboardRow | null
): Promise<string | null> {
  return saveRow("user_dashboards", userId, patch, row)
}

export function fetchBookmarks(userId: string): Promise<BookmarksRow | null> {
  return fetchRow<BookmarksRow>("user_bookmarks", "bookmark_tree, updated_at", userId)
}

/** The bookmark tree is the one big row - checked by version before downloading it. */
export function fetchBookmarksVersion(userId: string): Promise<string | null> {
  return fetchVersion("user_bookmarks", userId)
}

export function saveBookmarks(
  userId: string,
  patch: BookmarksPatch,
  row: BookmarksRow | null
): Promise<string | null> {
  return saveRow("user_bookmarks", userId, patch, row)
}

/**
 * Calls `onChange` with the new version whenever either of this user's rows is
 * saved - by any device, this one included. `onReconnect` runs when the
 * connection comes back after dropping, since anything saved meanwhile was
 * missed. supabase-js keeps the socket's auth current and reconnects on its
 * own. Without the realtime migration this just never fires.
 */
export function subscribeRemoteChanges(
  userId: string,
  onChange: (version: string | null) => void,
  onReconnect: () => void
): () => void {
  const filter = `user_id=eq.${userId}`
  const handle = (payload: { new: unknown }) => {
    const version = (payload.new as { updated_at?: unknown } | null)?.updated_at
    onChange(typeof version === "string" ? version : null)
  }
  let dropped = false

  const channel = supabase
    .channel(`stashwell-sync:${userId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "user_dashboards", filter }, handle)
    .on("postgres_changes", { event: "*", schema: "public", table: "user_bookmarks", filter }, handle)
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        if (dropped) onReconnect()
        dropped = false
      } else {
        dropped = true
      }
    })

  return () => {
    void supabase.removeChannel(channel)
  }
}
