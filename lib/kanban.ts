/**
 * Kanban board: a small set of cards, each pinned to a status column,
 * persisted to `chrome.storage.local` so the floating board survives being
 * closed and reopened.
 */

export type KanbanStatus = "todo" | "in-progress" | "done"

export interface KanbanCard {
  id: string
  title: string
  status: KanbanStatus
}

export const STORAGE_KEY = "kanbanCards"

export const STATUSES: { status: KanbanStatus; label: string }[] = [
  { status: "todo", label: "To Do" },
  { status: "in-progress", label: "In Progress" },
  { status: "done", label: "Done" },
]

export function hasStorageApi(): boolean {
  return typeof chrome !== "undefined" && !!chrome.storage?.local
}

let warned = false
function warnUnavailable() {
  if (warned) return
  warned = true
  console.warn(
    "chrome.storage is not available in this context (expected outside the extension, e.g. `next dev` in a regular browser tab)."
  )
}

function isKanbanCard(value: unknown): value is KanbanCard {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as Partial<KanbanCard>
  return (
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    typeof candidate.title === "string" &&
    (candidate.status === "todo" || candidate.status === "in-progress" || candidate.status === "done")
  )
}

/** Saved cards, or an empty board on first run. */
export async function readKanbanCards(): Promise<KanbanCard[]> {
  if (!hasStorageApi()) {
    warnUnavailable()
    return []
  }

  const stored = await chrome.storage.local.get(STORAGE_KEY)
  const raw = stored?.[STORAGE_KEY]
  if (!Array.isArray(raw)) return []

  return raw.filter(isKanbanCard)
}

export async function writeKanbanCards(cards: KanbanCard[]): Promise<void> {
  if (!hasStorageApi()) {
    warnUnavailable()
    return
  }
  await chrome.storage.local.set({ [STORAGE_KEY]: cards })
}

/**
 * Live updates when kanbanCards changes from *any* extension surface -
 * the toolbar popup's floating window and the dashboard's popover are
 * separate pages with separate JS contexts, so a write from one doesn't
 * touch the other's React state until something tells it to re-read.
 * chrome.storage.onChanged is that "something": it fires in every extension
 * page whenever chrome.storage.local.set() runs in any of them, including
 * the one that didn't write. Returns an unsubscribe function for cleanup.
 */
export function subscribeToKanbanCards(onChange: (cards: KanbanCard[]) => void): () => void {
  if (!hasStorageApi()) return () => {}

  function listener(
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: chrome.storage.AreaName
  ) {
    if (areaName !== "local") return
    const change = changes[STORAGE_KEY]
    if (!change) return

    const raw = change.newValue
    onChange(Array.isArray(raw) ? raw.filter(isKanbanCard) : [])
  }

  chrome.storage.onChanged.addListener(listener)
  return () => chrome.storage.onChanged.removeListener(listener)
}
