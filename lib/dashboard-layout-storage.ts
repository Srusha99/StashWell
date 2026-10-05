/**
 * chrome.storage.local persistence for the dashboard's per-workspace card
 * layout. Replaces the window.localStorage this used before - unlike
 * localStorage, chrome.storage.local is shared between every extension
 * context, and its onChanged event keeps open tabs in step.
 *
 * Key name is unchanged from the old localStorage version
 * (`workspaceKey(workspaceId, "dashboard-columns")`), and the old bare
 * `string[][]` value is still read, so an existing layout carries over.
 */

import { workspaceKey } from "@/lib/workspace-storage"

const STORAGE_NAME = "dashboard-columns"

/** Card ids grouped into columns, top to bottom. */
export type Columns = string[][]

/**
 * A workspace's saved card arrangement - one per column count.
 *
 * The count follows the window's width (hooks/use-column-count.ts), so it
 * changes whenever a window is snapped, resized, or a tab opens in a narrower
 * one. A single arrangement reflowed to fit the new count and written back
 * overwrote the layout the user had actually built; per-count storage means
 * each count keeps exactly what was last arranged at it, and returning to a
 * count always restores it.
 */
export interface DashboardLayout {
  byCount: Record<string, Columns>
  /** The count most recently arranged by hand. Counts with nothing saved are laid out from it. */
  primaryCount: number
  /**
   * False while this is only the auto-generated first arrangement - which is
   * never synced, so another device's arrangement replaces it (see
   * lib/dashboard-sync-layouts.ts). True once the user has moved a card.
   */
  arrangedByUser: boolean
}

function hasChromeStorage(): boolean {
  return typeof chrome !== "undefined" && !!chrome.storage?.local
}

function parseColumns(raw: unknown): Columns | null {
  if (!Array.isArray(raw)) return null
  const valid = raw.every(
    (col) => Array.isArray(col) && col.every((id) => typeof id === "string")
  )
  return valid ? (raw as Columns) : null
}

/** Wraps a bare arrangement (the pre-per-count format) as a layout. */
export function layoutFromColumns(columns: Columns, arrangedByUser: boolean): DashboardLayout {
  return { byCount: { [columns.length]: columns }, primaryCount: columns.length, arrangedByUser }
}

export function parseDashboardLayout(raw: unknown): DashboardLayout | null {
  // The old format: one bare arrangement, at whatever count it was saved at.
  // Only a drag ever wrote it, so it counts as arranged by the user.
  const legacy = parseColumns(raw)
  if (legacy) return legacy.length > 0 ? layoutFromColumns(legacy, true) : null

  if (!raw || typeof raw !== "object") return null
  const candidate = raw as Partial<DashboardLayout>
  if (!candidate.byCount || typeof candidate.byCount !== "object") return null

  const byCount: Record<string, Columns> = {}
  for (const [count, value] of Object.entries(candidate.byCount)) {
    const columns = parseColumns(value)
    if (columns && columns.length > 0 && columns.length === Number(count)) {
      byCount[count] = columns
    }
  }
  const counts = Object.keys(byCount)
  if (counts.length === 0) return null

  const primaryCount =
    typeof candidate.primaryCount === "number" && byCount[candidate.primaryCount]
      ? candidate.primaryCount
      : Number(counts[0])

  return { byCount, primaryCount, arrangedByUser: candidate.arrangedByUser === true }
}

function readLegacyLocalStorage(workspaceId: string): DashboardLayout | null {
  try {
    const raw = window.localStorage.getItem(workspaceKey(workspaceId, STORAGE_NAME))
    if (!raw) return null
    return parseDashboardLayout(JSON.parse(raw))
  } catch {
    return null
  }
}

/**
 * Reads this workspace's saved layout from chrome.storage.local. Falls back to
 * window.localStorage outside the extension (e.g. `next dev` in a plain
 * browser tab). The first time it finds a value under the old localStorage
 * key, it migrates that value into chrome.storage.local and removes the
 * localStorage copy, so an existing layout carries over instead of appearing
 * to reset.
 *
 * Rejects if chrome.storage can't be read, rather than resolving null: callers
 * treat null as "nothing saved" and may save a fresh arrangement, which after
 * a failed read would overwrite the real one.
 */
export async function readDashboardLayout(workspaceId: string): Promise<DashboardLayout | null> {
  if (!hasChromeStorage()) return readLegacyLocalStorage(workspaceId)

  const key = workspaceKey(workspaceId, STORAGE_NAME)
  const stored = await chrome.storage.local.get(key)
  const parsed = parseDashboardLayout(stored[key])
  if (parsed) return parsed

  const legacy = readLegacyLocalStorage(workspaceId)
  if (legacy) {
    try {
      await chrome.storage.local.set({ [key]: legacy })
      window.localStorage.removeItem(key)
    } catch {
      // Still readable from localStorage; the migration retries next read.
    }
  }
  return legacy
}

export async function writeDashboardLayout(
  workspaceId: string,
  layout: DashboardLayout
): Promise<void> {
  const key = workspaceKey(workspaceId, STORAGE_NAME)
  try {
    if (hasChromeStorage()) {
      await chrome.storage.local.set({ [key]: layout })
    } else {
      window.localStorage.setItem(key, JSON.stringify(layout))
    }
  } catch {
    // ignore write failures (storage disabled, quota exceeded)
  }
}

/**
 * Listens for this workspace's layout changing from elsewhere - another open
 * tab moving a card, another device's arrangement arriving through sync, or
 * the Privacy panel clearing it (reported as null). No-op outside the extension, since
 * window.localStorage has no equivalent cross-context change event this app
 * relies on.
 */
export function subscribeDashboardLayout(
  workspaceId: string,
  onChange: (layout: DashboardLayout | null) => void
): () => void {
  if (!hasChromeStorage()) return () => {}

  const key = workspaceKey(workspaceId, STORAGE_NAME)
  function handleChange(
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: chrome.storage.AreaName
  ) {
    if (areaName !== "local") return
    const change = changes[key]
    if (!change) return
    onChange(parseDashboardLayout(change.newValue))
  }

  chrome.storage.onChanged.addListener(handleChange)
  return () => chrome.storage.onChanged.removeListener(handleChange)
}
