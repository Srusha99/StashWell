/**
 * chrome.storage.local persistence for the dashboard's per-workspace column
 * layout (card ids grouped into columns, in drag order). Replaces the
 * window.localStorage this used before - unlike localStorage,
 * chrome.storage.local is shared between the popup and dashboard/newtab
 * contexts and can be overwritten by a Supabase pull on sign-in.
 *
 * Key name is unchanged from the old localStorage version
 * (`workspaceKey(workspaceId, "dashboard-columns")`), so the one-shot
 * migration below is a straight copy rather than a reshape.
 */

import { workspaceKey } from "@/lib/workspace-storage"

const STORAGE_NAME = "dashboard-columns"

export type Columns = string[][]

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

function readLegacyLocalStorage(workspaceId: string): Columns | null {
  try {
    const raw = window.localStorage.getItem(workspaceKey(workspaceId, STORAGE_NAME))
    if (!raw) return null
    return parseColumns(JSON.parse(raw))
  } catch {
    return null
  }
}

/**
 * Reads this workspace's saved column layout from chrome.storage.local.
 * Falls back to window.localStorage outside the extension (e.g. `next dev`
 * in a plain browser tab). The first time it finds a value under the old
 * localStorage key, it migrates that value into chrome.storage.local and
 * removes the localStorage copy, so an existing layout carries over instead
 * of appearing to reset.
 */
export async function readDashboardLayout(workspaceId: string): Promise<Columns | null> {
  const key = workspaceKey(workspaceId, STORAGE_NAME)

  try {
    if (hasChromeStorage()) {
      const stored = await chrome.storage.local.get(key)
      const parsed = parseColumns(stored[key])
      if (parsed) return parsed

      const legacy = readLegacyLocalStorage(workspaceId)
      if (legacy) {
        await chrome.storage.local.set({ [key]: legacy })
        window.localStorage.removeItem(key)
        return legacy
      }
      return null
    }

    return readLegacyLocalStorage(workspaceId)
  } catch {
    return null
  }
}

export async function writeDashboardLayout(workspaceId: string, columns: Columns): Promise<void> {
  const key = workspaceKey(workspaceId, STORAGE_NAME)
  try {
    if (hasChromeStorage()) {
      await chrome.storage.local.set({ [key]: columns })
    } else {
      window.localStorage.setItem(key, JSON.stringify(columns))
    }
  } catch {
    // ignore write failures (storage disabled, quota exceeded)
  }
}

/**
 * Listens for this workspace's layout changing from elsewhere - another
 * extension context (popup vs. dashboard/newtab) writing a drag-and-drop
 * move, or a Supabase pull landing after sign-in. No-op outside the
 * extension, since window.localStorage has no equivalent cross-context
 * change event this app relies on.
 */
export function subscribeDashboardLayout(
  workspaceId: string,
  onChange: (columns: Columns | null) => void
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
    onChange(parseColumns(change.newValue))
  }

  chrome.storage.onChanged.addListener(handleChange)
  return () => chrome.storage.onChanged.removeListener(handleChange)
}
