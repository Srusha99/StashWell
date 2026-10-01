/**
 * Backs the dashboard's per-workspace card layout up to the
 * `user_profiles.dashboard_layouts` jsonb column in Supabase - a map of
 * workspaceId -> DashboardLayout - and restores it onto a device that has none
 * of its own (a reinstall, or cleared extension storage).
 *
 * A backup, not a sync: the cloud copy never replaces a layout the user has
 * arranged on this device. It used to, on every page load and on every tab
 * refocus (Supabase fires SIGNED_IN for both), and the copy it pulled was
 * routinely stale - the debounced push after a drag was cancelled by the
 * refresh that followed it, and a window-width reflow got pushed as though it
 * were an arrangement. That is what kept moving cards the user had placed.
 * Bookmark ids also differ between Chrome installs, so another device's
 * layout wouldn't even name this device's folders.
 */

import { supabase } from "@/lib/supabaseClient"
import { type BookmarkNode, getTree, hasBookmarksApi } from "@/lib/bookmarks"
import {
  type Columns,
  type DashboardLayout,
  layoutFromColumns,
  parseDashboardLayout,
  readDashboardLayout,
  writeDashboardLayout,
} from "@/lib/dashboard-layout-storage"

/** The pre-per-count cloud format, still read so an existing backup restores. */
interface LegacyLayoutEntry {
  id: string
  title: string
  column: number
  position: number
}

type LayoutMap = Record<string, unknown>

interface UserProfileLayoutRow {
  dashboard_layouts: LayoutMap | null
}

function hasStorageApi(): boolean {
  return typeof chrome !== "undefined" && !!chrome.storage?.local
}

function isLegacyEntry(value: unknown): value is LegacyLayoutEntry {
  if (!value || typeof value !== "object") return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.id === "string" &&
    typeof entry.column === "number" &&
    typeof entry.position === "number"
  )
}

function legacyEntriesToColumns(entries: LegacyLayoutEntry[]): Columns {
  const columns: Columns = []
  const sorted = [...entries].sort((a, b) => a.position - b.position)
  for (const entry of sorted) {
    if (entry.column < 0) continue
    while (columns.length <= entry.column) columns.push([])
    columns[entry.column].push(entry.id)
  }
  return columns
}

function parseCloudLayout(raw: unknown): DashboardLayout | null {
  if (Array.isArray(raw) && raw.length > 0 && raw.every(isLegacyEntry)) {
    return layoutFromColumns(legacyEntriesToColumns(raw), true)
  }
  return parseDashboardLayout(raw)
}

function collectFolderIds(nodes: BookmarkNode[], into: Set<string>): Set<string> {
  for (const node of nodes) {
    if (node.children) {
      into.add(node.id)
      collectFolderIds(node.children, into)
    }
  }
  return into
}

// Every push is a read-modify-write of one shared jsonb map, so they run one
// at a time: two in flight together would each write back a map missing the
// other's change.
let pushQueue: Promise<void> = Promise.resolve()

/**
 * Backs up this workspace's layout. Fire-and-forget, and only for a layout the
 * user arranged - callers write chrome.storage.local first, and a push never
 * blocks on the network or gets cancelled by the page unloading.
 */
export function pushDashboardLayout(workspaceId: string, layout: DashboardLayout): void {
  pushQueue = pushQueue.then(() =>
    pushDashboardLayoutAsync(workspaceId, layout).catch((error: unknown) => {
      console.warn("dashboardLayoutSync.push failed:", error)
    })
  )
}

async function pushDashboardLayoutAsync(
  workspaceId: string,
  layout: DashboardLayout
): Promise<void> {
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

  const nextLayouts: LayoutMap = { ...(existing?.dashboard_layouts ?? {}), [workspaceId]: layout }

  const { error } = await supabase
    .from("user_profiles")
    .upsert({ user_id: user.id, dashboard_layouts: nextLayouts }, { onConflict: "user_id" })
  if (error) {
    console.warn("dashboardLayoutSync.push failed:", error.message)
  }
}

/**
 * Restores backed-up layouts onto this device - but only for a workspace with
 * no layout the user arranged here, and only when the backup names at least
 * one folder that exists here. Safe to call on every load and sign-in event
 * (see lib/auth-context.tsx): once a workspace has its own arrangement, this
 * never touches it again.
 */
export async function pullDashboardLayouts(userId: string): Promise<void> {
  if (!hasStorageApi() || !hasBookmarksApi()) return

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

  const folderIds = collectFolderIds(await getTree(), new Set())

  for (const [workspaceId, raw] of Object.entries(layouts)) {
    const backup = parseCloudLayout(raw)
    if (!backup?.arrangedByUser) continue

    let local: DashboardLayout | null
    try {
      local = await readDashboardLayout(workspaceId)
    } catch {
      continue // unreadable: never risk writing over it
    }
    if (local?.arrangedByUser) continue

    const namesLocalFolders = Object.values(backup.byCount).some((columns) =>
      columns.some((column) => column.some((id) => folderIds.has(id)))
    )
    if (!namesLocalFolders) continue

    await writeDashboardLayout(workspaceId, backup)
  }
}
