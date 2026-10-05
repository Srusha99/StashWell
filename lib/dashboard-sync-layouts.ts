/**
 * Translates each workspace's dashboard settings - the card arrangement, which
 * cards are hidden, and which show as a grid - between this device's Chrome
 * bookmark ids and a "portable" form any of the user's devices can apply: the
 * shape `user_dashboards.workspace_layout` stores.
 *
 * Chrome numbers bookmarks per install, so a layout saved as folder ids on one
 * PC names nothing on another. The portable form names each workspace and card
 * by its folder's title instead, which Chrome Sync keeps the same everywhere.
 * Titles are hashed with the user's id first, so no folder name is uploaded;
 * a title shared by sibling folders is told apart by its position among them.
 *
 * Only the most recently arranged column count is synced. Screens differ - the
 * same dashboard is 4 columns on one PC and 3 on another - and syncing every
 * count let a PC keep showing an arrangement it once made at its own width long
 * after the user rearranged elsewhere. So the latest arrangement replaces them
 * all, and each screen reflows it to fit (hooks/use-card-columns.ts).
 *
 * This never touches bookmarks. The folders themselves reach each device
 * through Chrome Sync, and a workspace's record through adoptOrphanedFolders
 * (lib/workspaces.ts); settings for a folder this device doesn't have are kept,
 * untouched, for the devices that do.
 */

import { type BookmarkNode, getTree, hasBookmarksApi, isFolder } from "@/lib/bookmarks"
import {
  type Columns,
  type DashboardLayout,
  parseDashboardLayout,
  readDashboardLayout,
  writeDashboardLayout,
} from "@/lib/dashboard-layout-storage"
import { hashValue, stableStringify } from "@/lib/dashboard-sync-merge"
import { readFolderViewMode, writeFolderViewMode } from "@/lib/folder-view-mode"
import { readHiddenFolders, writeHiddenFolders } from "@/lib/hidden-folders"
import {
  DEFAULT_WORKSPACE_ID,
  findContainerCandidates,
  readWorkspaceState,
  resolveWorkspace,
} from "@/lib/workspaces"

/** A workspace's latest arrangement, every card named by its portable ref. */
export interface PortableLayout {
  byCount: Record<string, string[][]>
  primaryCount: number
}

/**
 * Everything synced, one entry per unit: `<workspace key>/layout` (a
 * PortableLayout), `/hidden` and `/grid` (sorted card refs). Each unit merges
 * on its own (lib/dashboard-sync-merge.ts), so hiding a card on one PC and
 * dragging one on another don't overwrite each other.
 */
export type SyncUnits = Record<string, unknown>

type UnitKind = "layout" | "hidden" | "grid"

const SETTINGS_VERSION = 2

/** The workspace's own folder - its "Unsorted" card. */
const ROOT_REF = "root"

/**
 * Marks a card synced from another device whose folder hasn't reached this one
 * yet - Chrome Sync can lag behind. It holds the card's slot in a stored layout,
 * and is swapped for the real id once the folder arrives (see rehydrate). Never
 * collides with a Chrome id, which is always numeric.
 */
const PENDING_PREFIX = "sync:"

/**
 * The same idea for the hidden and grid lists, which store real ids only: refs
 * from another device that name no card here yet, kept so they're sent back
 * unchanged rather than dropped - and applied once their folder arrives.
 */
export const SYNC_PENDING_KEY = "stashwell_sync_pending"

interface PendingRefs {
  userId: string
  units: Record<string, string[]>
}

interface WorkspaceTarget {
  workspaceId: string
  /** As read at the start of this sync, so a write can tell if they changed since. */
  stored: DashboardLayout | null
  hidden: string[]
  idToRef: Map<string, string>
  refToId: Map<string, string>
}

export interface LocalSettings {
  userId: string
  units: SyncUnits
  /** Every workspace that resolved on this device, by workspace key. */
  targets: Map<string, WorkspaceTarget>
  pending: Record<string, string[]>
}

function unitKey(workspaceKey: string, kind: UnitKind): string {
  return `${workspaceKey}/${kind}`
}

function workspaceOf(unit: string): string {
  return unit.slice(0, unit.lastIndexOf("/"))
}

function sortedUnique(refs: string[]): string[] {
  return Array.from(new Set(refs)).sort()
}

function sameSet(a: string[], b: string[]): boolean {
  const setA = new Set(a)
  const setB = new Set(b)
  return setA.size === setB.size && [...setA].every((id) => setB.has(id))
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

/** Each folder's ref: `<kind>:<hashed title>:<nth folder with that title>`. */
async function refsFor(
  userId: string,
  kind: string,
  folders: BookmarkNode[]
): Promise<Map<string, string>> {
  const seen = new Map<string, number>()
  const refs = new Map<string, string>()
  for (const folder of folders) {
    const title = folder.title ?? ""
    const nth = seen.get(title) ?? 0
    seen.set(title, nth + 1)
    const hashed = (await sha256Hex(`${userId}\u0000${title}`)).slice(0, 16)
    refs.set(folder.id, `${kind}:${hashed}:${nth}`)
  }
  return refs
}

function invert(map: Map<string, string>): Map<string, string> {
  return new Map(Array.from(map, ([key, value]) => [value, key]))
}

/* -------------------------------------------------------------------------- */
/* Layouts                                                                     */
/* -------------------------------------------------------------------------- */

interface Slot {
  ref: string | null
  pending: boolean
}

/**
 * One count's columns as refs. Ids that name no card here - a deleted folder,
 * which hooks/use-card-columns.ts deliberately keeps - are left out. A card can
 * briefly appear twice: in a pending slot synced from another device, and
 * wherever this device's dashboard put it when its folder arrived. The synced
 * slot wins.
 */
function portableColumns(columns: Columns, idToRef: Map<string, string>): string[][] {
  const slots: Slot[][] = columns.map((column) =>
    column.map((id) =>
      id.startsWith(PENDING_PREFIX)
        ? { ref: id.slice(PENDING_PREFIX.length), pending: true }
        : { ref: idToRef.get(id) ?? null, pending: false }
    )
  )
  const chosen = new Map<string, Slot>()
  for (const slot of slots.flat()) {
    if (slot.ref === null) continue
    const current = chosen.get(slot.ref)
    if (!current || (slot.pending && !current.pending)) chosen.set(slot.ref, slot)
  }
  return slots.map((column) =>
    column.flatMap((slot) => (slot.ref !== null && chosen.get(slot.ref) === slot ? [slot.ref] : []))
  )
}

function toPortable(layout: DashboardLayout, idToRef: Map<string, string>): PortableLayout {
  const count = layout.primaryCount
  return { byCount: { [count]: portableColumns(layout.byCount[count], idToRef) }, primaryCount: count }
}

/** Replaces every count this device had: the arrangement from another device is newer than all of them. */
function toLocal(layout: PortableLayout, refToId: Map<string, string>): DashboardLayout {
  const byCount: Record<string, Columns> = {}
  for (const [count, columns] of Object.entries(layout.byCount)) {
    byCount[count] = columns.map((column) =>
      column.map((ref) => refToId.get(ref) ?? `${PENDING_PREFIX}${ref}`)
    )
  }
  return { byCount, primaryCount: layout.primaryCount, arrangedByUser: true }
}

/**
 * Swaps each pending slot whose folder has now arrived for the folder's real
 * id, dropping the copy the dashboard placed on its own. Null when nothing
 * changes. Leaves every other id alone - including ones it can't place, which
 * may be folders a backup restore is about to move in (lib/workspace-backup.ts).
 */
function rehydrate(layout: DashboardLayout, refToId: Map<string, string>): DashboardLayout | null {
  let changed = false
  const byCount: Record<string, Columns> = {}
  for (const [count, columns] of Object.entries(layout.byCount)) {
    const resolved = new Set<string>()
    const swapped = columns.map((column) =>
      column.map((id) => {
        if (!id.startsWith(PENDING_PREFIX)) return id
        const real = refToId.get(id.slice(PENDING_PREFIX.length))
        if (!real) return id
        changed = true
        resolved.add(real)
        return `${PENDING_PREFIX}${real}`
      })
    )
    byCount[count] = swapped.map((column) =>
      column.flatMap((id) => {
        if (id.startsWith(PENDING_PREFIX) && resolved.has(id.slice(PENDING_PREFIX.length))) {
          return [id.slice(PENDING_PREFIX.length)]
        }
        return resolved.has(id) ? [] : [id]
      })
    )
  }
  return changed ? { ...layout, byCount } : null
}

/* -------------------------------------------------------------------------- */
/* Reading and applying                                                        */
/* -------------------------------------------------------------------------- */

async function readPending(userId: string): Promise<Record<string, string[]>> {
  const stored = await chrome.storage.local.get(SYNC_PENDING_KEY)
  const raw = stored?.[SYNC_PENDING_KEY] as Partial<PendingRefs> | undefined
  // Refs are hashed with the user's id, so another account's never resolve.
  if (!raw || raw.userId !== userId || !raw.units || typeof raw.units !== "object") return {}
  const units: Record<string, string[]> = {}
  for (const [unit, refs] of Object.entries(raw.units)) {
    const parsed = parseRefs(refs)
    if (parsed && parsed.length > 0) units[unit] = parsed
  }
  return units
}

/**
 * Reads every workspace's settings on this device in portable form. Workspaces
 * whose folder can't be resolved, or isn't in the workspaces container, are
 * skipped - their settings in the cloud are carried as they are.
 */
export async function readLocalSettings(userId: string): Promise<LocalSettings> {
  const units: SyncUnits = {}
  const targets = new Map<string, WorkspaceTarget>()
  if (!hasBookmarksApi()) return { userId, units, targets, pending: {} }

  const [tree, pending] = await Promise.all([getTree(), readPending(userId)])
  const state = readWorkspaceState()
  const workspaceFolderIds = new Set(state.workspaces.map((workspace) => workspace.folderId))
  const containerFolders = findContainerCandidates(tree).flatMap((container) =>
    (container.children ?? []).filter(isFolder)
  )
  const workspaceRefs = await refsFor(userId, "w", containerFolders)

  for (const workspace of state.workspaces) {
    const resolved = resolveWorkspace(tree, workspace)
    if (resolved.status !== "ok" || !resolved.node) continue
    const root = resolved.node

    const key =
      workspace.id === DEFAULT_WORKSPACE_ID ? DEFAULT_WORKSPACE_ID : workspaceRefs.get(root.id)
    if (!key || targets.has(key)) continue

    // The same cards the dashboard shows (components/bookmarks/dashboard-view.tsx).
    const cardFolders = (root.children ?? []).filter(
      (node) => isFolder(node) && !workspaceFolderIds.has(node.id)
    )
    const idToRef = await refsFor(userId, "f", cardFolders)
    idToRef.set(root.id, ROOT_REF)

    let stored: DashboardLayout | null
    try {
      stored = await readDashboardLayout(workspace.id)
    } catch {
      continue // unreadable: never risk writing over it
    }
    const hidden = readHiddenFolders(workspace.id)

    targets.set(key, { workspaceId: workspace.id, stored, hidden, idToRef, refToId: invert(idToRef) })

    // An arrangement nobody made by hand isn't worth syncing - any device can
    // produce it from the bookmarks alone.
    if (stored?.arrangedByUser) units[unitKey(key, "layout")] = toPortable(stored, idToRef)

    const hiddenRefs = hidden.flatMap((id) => {
      const ref = idToRef.get(id)
      return ref ? [ref] : []
    })
    const gridRefs = Array.from(idToRef).flatMap(([id, ref]) =>
      readFolderViewMode(id) === "grid" ? [ref] : []
    )
    units[unitKey(key, "hidden")] = sortedUnique([
      ...hiddenRefs,
      ...(pending[unitKey(key, "hidden")] ?? []),
    ])
    units[unitKey(key, "grid")] = sortedUnique([
      ...gridRefs,
      ...(pending[unitKey(key, "grid")] ?? []),
    ])
  }

  return { userId, units, targets, pending }
}

/** Splits refs into this device's ids and the ones it can't place yet. */
function resolveRefs(refs: string[], refToId: Map<string, string>) {
  const ids: string[] = []
  const unresolved: string[] = []
  for (const ref of refs) {
    const id = refToId.get(ref)
    if (id) ids.push(id)
    else unresolved.push(ref)
  }
  return { ids, unresolved }
}

/**
 * Stores the merged settings on this device. Each write lands only over what
 * was read at the start of this sync - a change made since is newer than
 * anything here. Returns false if anything was skipped for that reason.
 */
export async function applyLocalSettings(merged: SyncUnits, local: LocalSettings): Promise<boolean> {
  let complete = true
  // Pending refs for workspaces that didn't resolve this time are kept as they were.
  const nextPending: Record<string, string[]> = Object.fromEntries(
    Object.entries(local.pending).filter(([unit]) => !local.targets.has(workspaceOf(unit)))
  )

  for (const [key, target] of local.targets) {
    // Arrangement
    const wanted = merged[unitKey(key, "layout")] as PortableLayout | undefined
    const current = local.units[unitKey(key, "layout")]
    let next: DashboardLayout | null = null
    if (wanted && (!current || hashValue(wanted) !== hashValue(current))) {
      next = toLocal(wanted, target.refToId)
    } else if (target.stored) {
      next = rehydrate(target.stored, target.refToId)
    }
    if (next) {
      let latest: DashboardLayout | null = null
      let readable = true
      try {
        latest = await readDashboardLayout(target.workspaceId)
      } catch {
        readable = false
      }
      if (readable && stableStringify(latest) === stableStringify(target.stored)) {
        await writeDashboardLayout(target.workspaceId, next)
      } else {
        complete = false
      }
    }

    // Hidden cards
    const hiddenWanted = merged[unitKey(key, "hidden")] as string[] | undefined
    if (hiddenWanted) {
      const { ids, unresolved } = resolveRefs(hiddenWanted, target.refToId)
      if (unresolved.length > 0) nextPending[unitKey(key, "hidden")] = unresolved
      // Ids that name no card here are kept as they are - the same reason
      // hooks/use-card-columns.ts keeps them in a layout.
      const hiddenNext = [...target.hidden.filter((id) => !target.idToRef.has(id)), ...ids]
      if (!sameSet(hiddenNext, target.hidden)) {
        if (sameSet(readHiddenFolders(target.workspaceId), target.hidden)) {
          writeHiddenFolders(target.workspaceId, hiddenNext)
        } else {
          complete = false
        }
      }
    }

    // Grid or list, per card
    const gridWanted = merged[unitKey(key, "grid")] as string[] | undefined
    if (gridWanted) {
      const grid = new Set(gridWanted)
      const { unresolved } = resolveRefs(gridWanted, target.refToId)
      if (unresolved.length > 0) nextPending[unitKey(key, "grid")] = unresolved
      for (const [id, ref] of target.idToRef) {
        const mode = grid.has(ref) ? "grid" : "list"
        if (readFolderViewMode(id) !== mode) writeFolderViewMode(id, mode)
      }
    }
  }

  if (stableStringify(nextPending) !== stableStringify(local.pending)) {
    const value: PendingRefs = { userId: local.userId, units: nextPending }
    await chrome.storage.local.set({ [SYNC_PENDING_KEY]: value })
  }
  return complete
}

/* -------------------------------------------------------------------------- */
/* Cloud format                                                                */
/* -------------------------------------------------------------------------- */

/**
 * One workspace in the cloud row. The layout's fields sit at the top level, as
 * in version 1, so a device still on a version-1 build keeps reading other
 * devices' arrangements instead of seeing none and uploading its own over them.
 */
interface StoredWorkspace {
  byCount?: Record<string, string[][]>
  primaryCount?: number
  hidden?: string[]
  grid?: string[]
}

export function serializeSettings(units: SyncUnits): unknown {
  const workspaces: Record<string, StoredWorkspace> = {}
  for (const [unit, value] of Object.entries(units)) {
    const kind = unit.slice(unit.lastIndexOf("/") + 1) as UnitKind
    const key = workspaceOf(unit)
    const entry = workspaces[key] ?? {}
    workspaces[key] = entry
    if (kind === "layout") Object.assign(entry, value as PortableLayout)
    else entry[kind] = value as string[]
  }
  return { version: SETTINGS_VERSION, workspaces }
}

function parseRefs(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || !raw.every((ref) => typeof ref === "string")) return null
  return sortedUnique(raw)
}

function parsePortableLayout(raw: unknown): PortableLayout | null {
  // Same shape as a stored layout, minus arrangedByUser - so the same
  // validation applies. Only the primary count is kept: version 1 stored every
  // count, which is what kept PCs of different widths apart.
  const parsed = parseDashboardLayout(raw)
  if (!parsed) return null
  const count = parsed.primaryCount
  return { byCount: { [count]: parsed.byCount[count] }, primaryCount: count }
}

/** The valid settings in a cloud row, or null if it has none. */
export function parseSettings(raw: unknown): SyncUnits | null {
  if (!raw || typeof raw !== "object") return null
  const workspaces = (raw as { workspaces?: unknown }).workspaces
  if (!workspaces || typeof workspaces !== "object") return null

  const units: SyncUnits = {}
  for (const [key, value] of Object.entries(workspaces)) {
    if (!value || typeof value !== "object") continue
    const entry = value as Record<string, unknown>
    // The layout's fields sit on the entry itself (see StoredWorkspace); an
    // early version-2 build nested them under `layout`.
    const layout = parsePortableLayout("byCount" in entry ? entry : entry.layout)
    if (layout) units[unitKey(key, "layout")] = layout
    const hidden = parseRefs(entry.hidden)
    if (hidden) units[unitKey(key, "hidden")] = hidden
    const grid = parseRefs(entry.grid)
    if (grid) units[unitKey(key, "grid")] = grid
  }
  return units
}
