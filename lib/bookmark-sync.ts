/**
 * Bookmark sync: keeps the bookmarks the dashboard shows - the Bookmarks Bar
 * (the Personal workspace) and the "StashWell Workspaces" folder (every other
 * workspace) - the same on every device the user signs in on, through the
 * `user_bookmarks` row. Nothing else in Chrome's bookmarks is read or touched.
 *
 * Chrome's ids differ per device, so the synced form is a plain tree of titles
 * and URLs. Within a folder, a bookmark is identified by its URL (so a rename
 * is an edit, not a delete-and-add) and a folder by its title. Merging is
 * three-way, against the tree as last synced on this device (the "base"), for
 * the same reason as lib/dashboard-sync-merge.ts: it's the only way to tell a
 * bookmark deleted on another device from one just added here. With no base -
 * the first sync on a device - both sides are combined and nothing is deleted.
 *
 * Applying a merged tree makes Chrome's folders match it: missing bookmarks are
 * created, extra ones removed, and order fixed. A folder or bookmark that was
 * renamed or re-pointed on another device is updated in place rather than
 * recreated, so it keeps its Chrome id - which the layout, hidden-card and
 * view-mode settings refer to it by.
 *
 * Whether it runs at all is this device's "Sync Bookmarks" setting (Settings >
 * Sync). Left unset, a device whose bookmarks Chrome Sync already carries (see
 * chromeSyncsBookmarks) leaves them to Chrome: two devices on the same Chrome
 * account would each get every new bookmark twice - once from Chrome, once
 * from here. Turning it on syncs regardless; turning it off never syncs.
 */

import {
  BOOKMARKS_BAR_ID,
  type BookmarkNode,
  findNode,
  getTree,
  isFolder,
  removeNode,
} from "@/lib/bookmarks"
import { hashValue, mergeOrder } from "@/lib/dashboard-sync-merge"
import { notifyLocalSettingChanged } from "@/lib/local-setting-events"
import { ensureWorkspacesContainer, findContainerCandidates, pickContainer } from "@/lib/workspaces"

/** A bookmark (`url` set) or folder (`children` set), with no Chrome ids. */
export interface SyncedNode {
  title: string
  url?: string
  children?: SyncedNode[]
}

export interface SyncedBookmarks {
  /** The Bookmarks Bar's contents. */
  bar: SyncedNode[]
  /** The "StashWell Workspaces" folder's contents - one folder per workspace. */
  workspaces: SyncedNode[]
}

const BOOKMARKS_VERSION = 1

/** Deeper than any real bookmark tree; only guards against a malformed row. */
const MAX_DEPTH = 64

/** The tree as last synced on this device, and with which account. */
export const BOOKMARK_BASE_KEY = "stashwell_bookmark_base"

interface BookmarkBase {
  userId: string
  tree: SyncedBookmarks
  /** The cloud row's updated_at when this was saved, to skip unchanged pulls. */
  remoteVersion: string | null
}

/* -------------------------------------------------------------------------- */
/* The "Sync Bookmarks" setting                                                */
/* -------------------------------------------------------------------------- */

/**
 * This device's choice, in localStorage - never synced, since whether Chrome
 * Sync carries a PC's bookmarks is a fact about that PC.
 */
export const BOOKMARK_SYNC_PREF_KEY = "stashwell:bookmark-sync"

/** "on" / "off" as chosen, or null if never set (see the file comment). */
export type BookmarkSyncPref = "on" | "off" | null

export function readBookmarkSyncPref(): BookmarkSyncPref {
  if (typeof window === "undefined") return null
  try {
    const value = window.localStorage.getItem(BOOKMARK_SYNC_PREF_KEY)
    return value === "on" || value === "off" ? value : null
  } catch {
    return null
  }
}

export function writeBookmarkSyncPref(on: boolean): void {
  try {
    window.localStorage.setItem(BOOKMARK_SYNC_PREF_KEY, on ? "on" : "off")
  } catch {
    return
  }
  notifyLocalSettingChanged(BOOKMARK_SYNC_PREF_KEY)
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                     */
/* -------------------------------------------------------------------------- */

/** Managed bookmarks (set by an administrator) can't be changed, so they're never synced. */
function toSynced(nodes: BookmarkNode[]): SyncedNode[] {
  return nodes.flatMap((node): SyncedNode[] => {
    if (node.unmodifiable) return []
    if (!isFolder(node)) return [{ title: node.title, url: node.url }]
    return [{ title: node.title, children: toSynced(node.children ?? []) }]
  })
}

export function readLocalBookmarks(tree: BookmarkNode[]): SyncedBookmarks {
  const bar = findNode(tree, BOOKMARKS_BAR_ID)
  // Only the container new workspaces go into - a duplicate one (two devices
  // each made one before they converged) is left to lib/workspaces.ts.
  const container = pickContainer(findContainerCandidates(tree))
  return { bar: toSynced(bar?.children ?? []), workspaces: toSynced(container?.children ?? []) }
}

/**
 * Whether Chrome Sync carries this device's bookmarks (Chrome 134+ reports it
 * per node). Older Chrome doesn't say, and is treated as not syncing.
 */
export function chromeSyncsBookmarks(tree: BookmarkNode[]): boolean {
  return findNode(tree, BOOKMARKS_BAR_ID)?.syncing === true
}

function countNodes(nodes: SyncedNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countNodes(node.children ?? []), 0)
}

function countTree(tree: SyncedBookmarks): number {
  return countNodes(tree.bar) + countNodes(tree.workspaces)
}

/* -------------------------------------------------------------------------- */
/* Merging                                                                     */
/* -------------------------------------------------------------------------- */

/** Each node's identity within its folder, numbered when a folder has repeats. */
function keyed<T extends { title: string; url?: string }>(nodes: T[]): [string, T][] {
  const seen = new Map<string, number>()
  return nodes.map((node) => {
    const identity = node.url !== undefined ? `b\u0000${node.url}` : `d\u0000${node.title}`
    const nth = seen.get(identity) ?? 0
    seen.set(identity, nth + 1)
    return [`${identity}\u0000${nth}`, node]
  })
}

/** This device's edit wins; with nothing to compare against, the cloud's does. */
function pickTitle(base: string | undefined, local: string, remote: string): string {
  if (base === undefined) return remote
  return local !== base ? local : remote
}

function mergeChildren(base: SyncedNode[], local: SyncedNode[], remote: SyncedNode[]): SyncedNode[] {
  const baseKeyed = keyed(base)
  const localKeyed = keyed(local)
  const remoteKeyed = keyed(remote)
  const baseByKey = new Map(baseKeyed)
  const localByKey = new Map(localKeyed)
  const remoteByKey = new Map(remoteKeyed)

  const keep = new Map<string, SyncedNode>()
  for (const key of new Set([...localByKey.keys(), ...remoteByKey.keys()])) {
    const here = localByKey.get(key)
    const there = remoteByKey.get(key)
    const before = baseByKey.get(key)

    if (here && there) {
      keep.set(
        key,
        here.url !== undefined
          ? { title: pickTitle(before?.title, here.title, there.title), url: here.url }
          : {
              title: here.title,
              children: mergeChildren(before?.children ?? [], here.children ?? [], there.children ?? []),
            }
      )
    } else if (here) {
      // Gone from the cloud: deleted on another device - unless it's new here,
      // or (a folder) was changed here since, in which case the change is kept.
      if (!before || hashValue(here) !== hashValue(before)) keep.set(key, here)
    } else if (there) {
      if (!before || hashValue(there) !== hashValue(before)) keep.set(key, there)
    }
  }

  return mergeOrder(
    baseKeyed.map(([key]) => key),
    localKeyed.map(([key]) => key),
    remoteKeyed.map(([key]) => key),
    keep
  )
}

/**
 * Three-way merge of this device's bookmarks with the cloud's. `base` null is
 * a first sync: both sides are combined, nothing deleted.
 */
export function mergeBookmarks(
  base: SyncedBookmarks | null,
  local: SyncedBookmarks,
  remote: SyncedBookmarks
): SyncedBookmarks {
  // One side suddenly empty where the last sync had bookmarks is far likelier
  // a wiped profile or a failed read than the user deleting everything - so
  // it's merged as a first sync, and nothing is deleted from the other side.
  const trusted =
    base && countTree(base) > 0 && (countTree(local) === 0 || countTree(remote) === 0) ? null : base
  return {
    bar: mergeChildren(trusted?.bar ?? [], local.bar, remote.bar),
    workspaces: mergeChildren(trusted?.workspaces ?? [], local.workspaces, remote.workspaces),
  }
}

/* -------------------------------------------------------------------------- */
/* Applying                                                                    */
/* -------------------------------------------------------------------------- */

async function createNode(parentId: string, want: SyncedNode): Promise<BookmarkNode> {
  if (want.url !== undefined) {
    return chrome.bookmarks.create({ parentId, title: want.title, url: want.url })
  }
  const folder = await chrome.bookmarks.create({ parentId, title: want.title })
  for (const child of want.children ?? []) await createNode(folder.id, child)
  return folder
}

/**
 * A node about to be removed that is really `want` renamed (a folder with the
 * same contents) or re-pointed (a bookmark with the same title) - updated in
 * place instead, so it keeps its Chrome id.
 */
async function takeRenamed(spare: BookmarkNode[], want: SyncedNode): Promise<BookmarkNode | null> {
  const wantedContents = want.url === undefined ? hashValue(want.children ?? []) : null
  const index = spare.findIndex((node) =>
    want.url === undefined
      ? isFolder(node) && hashValue(toSynced(node.children ?? [])) === wantedContents
      : !isFolder(node) && node.title === want.title
  )
  if (index === -1) return null
  const [node] = spare.splice(index, 1)
  await chrome.bookmarks.update(node.id, want.url === undefined ? { title: want.title } : { url: want.url })
  return node
}

/** Moves `order`'s nodes into that order, front to back - so every move is upward. */
async function reorder(parentId: string, order: string[]): Promise<void> {
  const ids = (await chrome.bookmarks.getChildren(parentId)).map((node) => node.id)
  for (let index = 0; index < order.length; index++) {
    if (ids[index] === order[index]) continue
    const from = ids.indexOf(order[index])
    if (from === -1) continue
    await chrome.bookmarks.move(order[index], { parentId, index })
    ids.splice(from, 1)
    ids.splice(index, 0, order[index])
  }
}

/** Makes `parentId`'s contents (`current`, a fresh subtree) match `target`. */
async function reconcile(parentId: string, current: BookmarkNode[], target: SyncedNode[]): Promise<void> {
  const editable = keyed(current.filter((node) => !node.unmodifiable))
  const byKey = new Map(editable)
  const targetKeyed = keyed(target)
  const wanted = new Set(targetKeyed.map(([key]) => key))
  const spare = editable.filter(([key]) => !wanted.has(key)).map(([, node]) => node)

  const order: string[] = []
  for (const [key, want] of targetKeyed) {
    let node = byKey.get(key) ?? (await takeRenamed(spare, want))
    if (!node) {
      node = await createNode(parentId, want)
    } else if (want.url === undefined) {
      await reconcile(node.id, node.children ?? [], want.children ?? [])
    } else if (node.title !== want.title) {
      await chrome.bookmarks.update(node.id, { title: want.title })
    }
    order.push(node.id)
  }

  for (const node of spare) await removeNode(node.id, isFolder(node))
  await reorder(parentId, order)
}

async function reconcileFolder(folderId: string, target: SyncedNode[]): Promise<void> {
  const [folder] = await chrome.bookmarks.getSubTree(folderId)
  await reconcile(folderId, folder?.children ?? [], target)
}

/** Makes this device's dashboard bookmarks match `target`. */
export async function applyBookmarks(target: SyncedBookmarks): Promise<void> {
  await reconcileFolder(BOOKMARKS_BAR_ID, target.bar)

  const container = pickContainer(findContainerCandidates(await getTree()))
  if (!container && target.workspaces.length === 0) return
  const containerId = container?.id ?? (await ensureWorkspacesContainer())
  if (containerId) await reconcileFolder(containerId, target.workspaces)
}

/* -------------------------------------------------------------------------- */
/* Storage                                                                     */
/* -------------------------------------------------------------------------- */

export function serializeBookmarks(tree: SyncedBookmarks): unknown {
  return { version: BOOKMARKS_VERSION, ...tree }
}

function parseNodes(raw: unknown, depth: number): SyncedNode[] | null {
  if (!Array.isArray(raw) || depth > MAX_DEPTH) return null
  const nodes: SyncedNode[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const { title, url, children } = item as Record<string, unknown>
    if (typeof title !== "string") continue
    if (typeof url === "string") {
      nodes.push({ title, url })
      continue
    }
    const parsed = parseNodes(children ?? [], depth + 1)
    if (parsed) nodes.push({ title, children: parsed })
  }
  return nodes
}

/** The tree in a cloud row or stored base, or null if it isn't one. */
export function parseBookmarks(raw: unknown): SyncedBookmarks | null {
  if (!raw || typeof raw !== "object") return null
  const { bar, workspaces } = raw as Record<string, unknown>
  const parsedBar = parseNodes(bar, 0)
  const parsedWorkspaces = parseNodes(workspaces ?? [], 0)
  if (!parsedBar || !parsedWorkspaces) return null
  return { bar: parsedBar, workspaces: parsedWorkspaces }
}

export async function readBookmarkBase(): Promise<BookmarkBase | null> {
  const stored = await chrome.storage.local.get(BOOKMARK_BASE_KEY)
  const raw = stored?.[BOOKMARK_BASE_KEY] as Partial<BookmarkBase> | undefined
  if (!raw || typeof raw.userId !== "string") return null
  const tree = parseBookmarks(raw.tree)
  if (!tree) return null
  return {
    userId: raw.userId,
    tree,
    remoteVersion: typeof raw.remoteVersion === "string" ? raw.remoteVersion : null,
  }
}

export async function writeBookmarkBase(base: BookmarkBase): Promise<void> {
  await chrome.storage.local.set({ [BOOKMARK_BASE_KEY]: base })
}
