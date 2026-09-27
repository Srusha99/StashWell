/**
 * Syncs the dashboard's per-workspace column layout between
 * chrome.storage.local and the `user_profiles.dashboard_layouts` jsonb
 * column in Supabase - a map of workspaceId -> LayoutEntry[].
 *
 * Local-first, same idiom as lib/syncEngine.ts: callers write to
 * chrome.storage.local first (see hooks/use-card-columns.ts), then call
 * pushDashboardLayout without awaiting it. dashboard_layouts is a single
 * jsonb map shared across every workspace, so a push has to read-modify-write
 * the row rather than a plain upsert of one column - acceptable because
 * pushes are already debounced client-side (hooks/use-dashboard-layout-sync.ts)
 * and are not a hot path.
 */

import { supabase } from "@/lib/supabaseClient"
import { writeDashboardLayout, type Columns } from "@/lib/dashboard-layout-storage"

export interface LayoutEntry {
  id: string
  title: string
  column: number
  position: number
}

type LayoutMap = Record<string, LayoutEntry[]>

interface UserProfileLayoutRow {
  dashboard_layouts: LayoutMap | null
}

function hasStorageApi(): boolean {
  return typeof chrome !== "undefined" && !!chrome.storage?.local
}

function isLayoutEntry(value: unknown): value is LayoutEntry {
  if (!value || typeof value !== "object") return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.id === "string" &&
    typeof entry.title === "string" &&
    typeof entry.column === "number" &&
    typeof entry.position === "number"
  )
}

function entriesToColumns(entries: LayoutEntry[]): Columns {
  const columns: Columns = []
  const sorted = [...entries].sort((a, b) => a.position - b.position)
  for (const entry of sorted) {
    if (entry.column < 0) continue
    while (columns.length <= entry.column) columns.push([])
    columns[entry.column].push(entry.id)
  }
  return columns
}

/**
 * Fire-and-forget upsert of this workspace's layout into this user's
 * `user_profiles` row. Callers must write to chrome.storage.local first -
 * this never blocks on the network.
 */
export function pushDashboardLayout(workspaceId: string, entries: LayoutEntry[]): void {
  void pushDashboardLayoutAsync(workspaceId, entries)
}

async function pushDashboardLayoutAsync(workspaceId: string, entries: LayoutEntry[]): Promise<void> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  const user = sessionData.session?.user
  if (sessionError || !user) return

  const { data: existing, error: readError } = await supabase
    .from("user_profiles")
    .select("dashboard_layouts")
    .eq("user_id", user.id)
    .maybeSingle<UserProfileLayoutRow>()
  if (readError) {
    console.warn("dashboardLayoutSync.push failed to read existing layouts:", readError.message)
    return
  }

  const nextLayouts: LayoutMap = { ...(existing?.dashboard_layouts ?? {}), [workspaceId]: entries }

  const { error } = await supabase
    .from("user_profiles")
    .upsert({ user_id: user.id, dashboard_layouts: nextLayouts }, { onConflict: "user_id" })
  if (error) {
    console.warn("dashboardLayoutSync.push failed:", error.message)
  }
}

/**
 * Reads every workspace's layout from this user's `user_profiles` row and
 * overwrites the matching chrome.storage.local entry for each. Call on
 * mount once a session is found, alongside syncEngine's pullFromCloud - see
 * lib/auth-context.tsx. A workspace id from the cloud map that doesn't
 * exist on this device (different Chrome install, unresolvable folder) is
 * written anyway; it simply sits unread until/unless that workspace id ever
 * resolves locally.
 */
export async function pullDashboardLayouts(userId: string): Promise<void> {
  if (!hasStorageApi()) return

  const { data, error } = await supabase
    .from("user_profiles")
    .select("dashboard_layouts")
    .eq("user_id", userId)
    .maybeSingle<UserProfileLayoutRow>()

  if (error) {
    console.warn("dashboardLayoutSync.pull failed:", error.message)
    return
  }
  const layouts = data?.dashboard_layouts
  if (!layouts || typeof layouts !== "object") return

  for (const [workspaceId, entries] of Object.entries(layouts)) {
    if (!Array.isArray(entries) || !entries.every(isLayoutEntry)) continue
    await writeDashboardLayout(workspaceId, entriesToColumns(entries))
  }
}
