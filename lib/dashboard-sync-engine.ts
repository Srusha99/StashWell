/**
 * Keeps a signed-in user's StashWell the same on every device they sign in on:
 *
 *  - the bookmarks the dashboard shows (lib/bookmark-sync.ts), in the
 *    `user_bookmarks` row;
 *  - each workspace's card arrangement, hidden cards and grid/list views
 *    (lib/dashboard-sync-layouts.ts), saved tab sessions, the kanban board, and
 *    appearance settings (lib/settings-sync.ts), in the `user_dashboards` row.
 *
 * Signed out, none of this runs and everything stays on the device ("Local
 * Mode").
 *
 * Local-first: everything keeps reading and writing chrome.storage.local,
 * localStorage and Chrome's bookmarks exactly as before, online or not. This
 * engine sits beside it - it watches those, and a sync is "read local, fetch
 * the cloud row, three-way merge, write back whatever changed on each side".
 * Because it works from storage rather than from any one screen's state, a
 * task added in the toolbar popup or a session saved from the right-click menu
 * (public/background.js) syncs the same way as a card dragged on the
 * dashboard.
 *
 * Offline, nothing is lost and nothing needs queueing: every change is already
 * saved locally, and the merge base (what this device and the cloud last
 * agreed on) is what tells the next sync what changed here meanwhile. Coming
 * back online triggers that sync straight away.
 *
 * Every open dashboard tab runs this, so each sync holds a Web Lock: tabs take
 * turns, and a tab whose turn comes after another already pushed the same
 * change finds nothing left to do.
 */

import { getTree, hasBookmarksApi, subscribeToChanges } from "@/lib/bookmarks"
import {
  type BookmarkSyncPref,
  applyBookmarks,
  chromeSyncsBookmarks,
  mergeBookmarks,
  parseBookmarks,
  readBookmarkBase,
  readLocalBookmarks,
  serializeBookmarks,
  writeBookmarkBase,
} from "@/lib/bookmark-sync"
import {
  type DashboardPatch,
  fetchBookmarks,
  fetchBookmarksVersion,
  fetchDashboard,
  saveBookmarks,
  saveDashboard,
  subscribeRemoteChanges,
} from "@/lib/dashboard-sync-service"
import {
  type Snapshot,
  hashUnits,
  hashValue,
  mergeCollections,
  mergeSettings,
  sameSnapshot,
  snapshotOf,
} from "@/lib/dashboard-sync-merge"
import {
  type SyncUnits,
  applyLocalSettings,
  parseSettings,
  readLocalSettings,
  serializeSettings,
} from "@/lib/dashboard-sync-layouts"
import { subscribeLocalSettings } from "@/lib/local-setting-events"
import {
  type KanbanCard,
  STORAGE_KEY as KANBAN_STORAGE_KEY,
  missingKanbanCards,
  parseKanbanCards,
  readKanbanCards,
  updateKanbanCards,
} from "@/lib/kanban"
import {
  type SessionBundle,
  type SessionBundleMap,
  STORAGE_KEY as SESSIONS_STORAGE_KEY,
  missingSessionBundles,
  parseSessionBundles,
  readSessionBundleMap,
  writeSessionBundleMap,
} from "@/lib/session-bundles"
import {
  type AppearanceUnits,
  applyAppearance,
  parseAppearance,
  readLocalAppearance,
} from "@/lib/settings-sync"
import { APPEARANCE_STORAGE_KEY } from "@/hooks/use-appearance-settings"

/**
 * Shown in Settings > Sync, so it's easy to tell which build each
 * device is on. Bump whenever what syncs changes. 3: bookmarks and appearance
 * settings.
 */
export const SYNC_VERSION = 3

export type SyncStatus = "idle" | "saving" | "synced" | "offline" | "error"

/** Who carries this device's bookmarks between devices. */
export type BookmarkSyncMode =
  | "stashwell"
  /** Chrome Sync already does, and "Sync Bookmarks" was never set - see chromeSyncsBookmarks. */
  | "chrome"
  /** Nobody: "Sync Bookmarks" is off on this device. */
  | "off"
  /** This Chrome profile's bookmarks last synced with a different StashWell account. */
  | "other-account"

/**
 * What this device and the cloud last agreed on (see lib/dashboard-sync-merge.ts).
 * A null field has never synced on this device. Local-only and never synced.
 * The bookmarks' equivalent is lib/bookmark-sync.ts's BOOKMARK_BASE_KEY.
 */
export const SYNC_META_KEY = "stashwell_sync_meta"
const SYNC_LOCK = "stashwell-dashboard-sync"

/** Long enough to batch a burst of edits (a drag writes once per drop, but a
 * restore writes many times) into one upload. */
const LOCAL_CHANGE_DELAY_MS = 500
/** One save can touch both rows; this turns their two events into one pull. */
const REMOTE_CHANGE_DELAY_MS = 250
/** How often a visible dashboard checks for changes made on other devices -
 * the fallback for live sync, and all there is without it. */
const POLL_INTERVAL_MS = 60_000
/** Returning to a tab pulls, but not again within this long. */
const FOCUS_PULL_THROTTLE_MS = 10_000
const RETRY_DELAY_MS = 30_000
const MAX_RETRY_DELAY_MS = 5 * 60_000
/** A save that lost a race to another device re-merges and tries again. */
const MAX_ATTEMPTS = 3

interface SyncMeta {
  userId: string
  todos: Snapshot | null
  sessions: Snapshot | null
  /** Hash per workspace settings unit (see lib/dashboard-sync-layouts.ts). */
  settings: Record<string, string> | null
  /** Hash per appearance field (see lib/settings-sync.ts). */
  appearance: Record<string, string> | null
}

/* -------------------------------------------------------------------------- */
/* Status                                                                      */
/* -------------------------------------------------------------------------- */

export interface SyncState {
  status: SyncStatus
  /** When this tab last finished a sync, or null if it hasn't yet. */
  lastSyncedAt: number | null
  /** Null until the first sync has looked at this device's bookmarks. */
  bookmarks: BookmarkSyncMode | null
}

export const IDLE_SYNC_STATE: SyncState = { status: "idle", lastSyncedAt: null, bookmarks: null }

let state: SyncState = IDLE_SYNC_STATE
const stateListeners = new Set<() => void>()

function publish(next: SyncState) {
  state = next
  for (const listener of stateListeners) listener()
}

function setStatus(status: SyncStatus) {
  if (status !== state.status) publish({ ...state, status })
}

function setBookmarkMode(bookmarks: BookmarkSyncMode) {
  if (bookmarks !== state.bookmarks) publish({ ...state, bookmarks })
}

export function getSyncState(): SyncState {
  return state
}

export function subscribeSyncState(listener: () => void): () => void {
  stateListeners.add(listener)
  return () => stateListeners.delete(listener)
}

/* -------------------------------------------------------------------------- */
/* Local state                                                                 */
/* -------------------------------------------------------------------------- */

function hasStorageApi(): boolean {
  return typeof chrome !== "undefined" && !!chrome.storage?.local
}

function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false
}

/**
 * Runs `task` while no other tab or popup is syncing. Also taken by anything
 * that rewrites synced data wholesale (lib/privacy-data.ts), so a sync can't
 * read half of it.
 */
export async function withSyncLock<T>(task: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return await navigator.locks.request(SYNC_LOCK, task)
  }
  return task()
}

function isSnapshot(value: unknown): value is Snapshot {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        Array.isArray(entry) &&
        entry.length === 2 &&
        typeof entry[0] === "string" &&
        typeof entry[1] === "string"
    )
  )
}

function asHashes(value: unknown): Record<string, string> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, string>)
    : null
}

async function readMeta(): Promise<SyncMeta | null> {
  const stored = await chrome.storage.local.get(SYNC_META_KEY)
  const raw = stored?.[SYNC_META_KEY] as Partial<SyncMeta> | undefined
  if (!raw || typeof raw.userId !== "string") return null
  return {
    userId: raw.userId,
    todos: isSnapshot(raw.todos) ? raw.todos : null,
    sessions: isSnapshot(raw.sessions) ? raw.sessions : null,
    settings: asHashes(raw.settings),
    appearance: asHashes(raw.appearance),
  }
}

async function writeMeta(meta: SyncMeta): Promise<void> {
  await chrome.storage.local.set({ [SYNC_META_KEY]: meta })
}

function cardId(card: KanbanCard): string {
  return card.id
}

function bundleId(bundle: SessionBundle): string {
  return bundle.id
}

/** By id: sessions are stored as a map, and the cloud (jsonb) doesn't keep
 * key order, so order carries no meaning and mustn't count as a change. */
function sortedBundles(bundles: SessionBundle[]): SessionBundle[] {
  return [...bundles].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

function bundleMap(bundles: SessionBundle[]): SessionBundleMap {
  return Object.fromEntries(bundles.map((bundle) => [bundle.id, bundle]))
}

function changedSince(items: Snapshot, base: Snapshot | null): boolean {
  return base === null ? items.length > 0 : !sameSnapshot(items, base)
}

function unitsChangedSince(units: Record<string, unknown>, base: Record<string, string> | null): boolean {
  return Object.entries(units).some(([unit, value]) => base?.[unit] !== hashValue(value))
}

/* -------------------------------------------------------------------------- */
/* One sync                                                                    */
/* -------------------------------------------------------------------------- */

type Outcome = "done" | "retry"

/**
 * Versions (as epoch ms) of rows this tab saved, so live sync can ignore the
 * event its own save sends back. Compared as times, since Realtime and the
 * REST API don't format updated_at the same way.
 */
const ownVersions = new Set<number>()
const MAX_OWN_VERSIONS = 20

function rememberOwnVersion(version: string) {
  ownVersions.add(Date.parse(version))
  if (ownVersions.size > MAX_OWN_VERSIONS) {
    ownVersions.delete(ownVersions.values().next().value as number)
  }
}

function isOwnVersion(version: string | null): boolean {
  return version !== null && ownVersions.has(Date.parse(version))
}

/** Bookmarks first: the dashboard's settings name folders that may only exist once this has run. */
async function syncBookmarksOnce(userId: string, pull: boolean, pref: BookmarkSyncPref): Promise<Outcome> {
  if (pref === "off") {
    setBookmarkMode("off")
    return "done"
  }
  if (!hasBookmarksApi()) return "done"

  const tree = await getTree()
  if (pref !== "on" && chromeSyncsBookmarks(tree)) {
    setBookmarkMode("chrome")
    return "done"
  }
  const stored = await readBookmarkBase()
  // These are the Chrome profile's bookmarks, not the account's: merging them
  // into a second account would hand one person's bookmarks to another.
  if (stored && stored.userId !== userId) {
    setBookmarkMode("other-account")
    return "done"
  }
  setBookmarkMode("stashwell")

  const base = stored?.tree ?? null
  const local = readLocalBookmarks(tree)
  const dirty = base === null || hashValue(local) !== hashValue(base)
  if (!pull && !dirty) return "done"
  if (dirty) setStatus("saving")
  if (!isOnline()) return "done"

  // The tree is the one big download - skip it when nothing changed on either side.
  if (!dirty && stored?.remoteVersion) {
    const version = await fetchBookmarksVersion(userId)
    if (version === stored.remoteVersion) return "done"
  }

  const row = await fetchBookmarks(userId)
  const remote = row ? parseBookmarks(row.bookmark_tree) : null
  const merged = remote ? mergeBookmarks(base, local, remote) : local

  if (hashValue(merged) !== hashValue(local)) {
    // An edit made while the request was out isn't in `merged` - applying it
    // now would delete that edit. Merge again with it instead.
    if (hashValue(readLocalBookmarks(await getTree())) !== hashValue(local)) return "retry"
    await applyBookmarks(merged)
  }

  let remoteVersion = row?.updated_at ?? null
  if (!remote || hashValue(merged) !== hashValue(remote)) {
    setStatus("saving")
    remoteVersion = await saveBookmarks(userId, { bookmark_tree: serializeBookmarks(merged) }, row)
    // Another device saved first: merge again, against its copy.
    if (!remoteVersion) return "retry"
    rememberOwnVersion(remoteVersion)
  }

  await writeBookmarkBase({ userId, tree: merged, remoteVersion })
  return "done"
}

/**
 * `syncSessions` false (a Free account - see lib/bundle-gate.ts) leaves saved
 * sessions out entirely: they stay on this device, and their merge base is
 * kept as it was, ready for the day they start syncing.
 */
async function syncDashboardOnce(
  userId: string,
  pull: boolean,
  syncSessions: boolean
): Promise<Outcome> {
  const stored = await readMeta()
  // Someone else signed in on this device: what's stored here is the previous
  // account's. Show this account's own data, and never upload the other's.
  const switchedAccount = stored !== null && stored.userId !== userId
  const base: SyncMeta =
    stored && !switchedAccount
      ? stored
      : { userId, todos: null, sessions: null, settings: null, appearance: null }

  const [todos, sessionMap, local, appearance] = await Promise.all([
    readKanbanCards(),
    readSessionBundleMap(),
    readLocalSettings(userId),
    readLocalAppearance(),
  ])
  const sessions = sortedBundles(Object.values(sessionMap))

  const dirty =
    changedSince(snapshotOf(todos, cardId), base.todos) ||
    (syncSessions && changedSince(snapshotOf(sessions, bundleId), base.sessions)) ||
    unitsChangedSince(local.units, base.settings) ||
    unitsChangedSince(appearance.units, base.appearance)
  const neverSynced =
    base.todos === null ||
    (syncSessions && base.sessions === null) ||
    base.settings === null ||
    base.appearance === null
  if (!pull && !dirty && !neverSynced && !switchedAccount) return "done"

  if (dirty) setStatus("saving")
  if (!isOnline()) return "done"

  const row = await fetchDashboard(userId)
  const remoteTodos = row ? parseKanbanCards(row.todos) : null
  const remoteBundles = row ? parseSessionBundles(row.session_bundles) : null
  const remoteSessions = remoteBundles ? sortedBundles(remoteBundles) : null
  const remoteSettings = row ? parseSettings(row.workspace_layout) : null
  const remoteAppearance = row ? parseAppearance(row.settings) : null

  let mergedTodos: KanbanCard[]
  let mergedSessions: SessionBundle[]
  let mergedSettings: SyncUnits
  let mergedAppearance: AppearanceUnits
  if (!syncSessions) {
    mergedSessions = sessions
  } else if (switchedAccount) {
    mergedSessions = remoteSessions ?? []
  } else {
    mergedSessions = sortedBundles(
      mergeCollections({
        base: base.sessions,
        local: sessions,
        remote: remoteSessions,
        getId: bundleId,
        missing: missingSessionBundles,
      })
    )
  }
  if (switchedAccount) {
    mergedTodos = remoteTodos ?? []
    mergedSettings = remoteSettings ?? {}
    mergedAppearance = remoteAppearance ?? {}
  } else {
    mergedTodos = mergeCollections({
      base: base.todos,
      local: todos,
      remote: remoteTodos,
      getId: cardId,
      missing: missingKanbanCards,
    })
    mergedSettings = mergeSettings(base.settings, local.units, remoteSettings)
    mergedAppearance = mergeSettings(base.appearance, appearance.units, remoteAppearance)
  }

  // Write this device's side first. Each write only lands over the exact data
  // read above: an edit made while the request was out is newer than this
  // merge, and is picked up by the next sync instead.
  let todosWritten = true
  if (hashValue(mergedTodos) !== hashValue(todos)) {
    const readHash = hashValue(todos)
    const written = await updateKanbanCards((current) =>
      hashValue(current) === readHash ? mergedTodos : current
    )
    todosWritten = written === mergedTodos
  }

  let sessionsWritten = true
  if (hashValue(mergedSessions) !== hashValue(sessions)) {
    const latest = sortedBundles(Object.values(await readSessionBundleMap()))
    sessionsWritten = hashValue(latest) === hashValue(sessions)
    if (sessionsWritten) await writeSessionBundleMap(bundleMap(mergedSessions))
  }

  const settingsWritten = await applyLocalSettings(mergedSettings, local)
  const appearanceWritten = await applyAppearance(mergedAppearance, appearance)
  const allWritten = todosWritten && sessionsWritten && settingsWritten && appearanceWritten

  if (switchedAccount) {
    // Not marking this device as the new account's until all of it is
    // replaced - a half-swapped device must not merge the rest upward.
    if (!allWritten) return "retry"
  } else {
    const patch: DashboardPatch = {}
    if (remoteTodos === null || hashValue(mergedTodos) !== hashValue(remoteTodos)) {
      patch.todos = mergedTodos
    }
    if (
      syncSessions &&
      (remoteSessions === null || hashValue(mergedSessions) !== hashValue(remoteSessions))
    ) {
      patch.session_bundles = bundleMap(mergedSessions)
    }
    if (remoteSettings === null || hashValue(mergedSettings) !== hashValue(remoteSettings)) {
      patch.workspace_layout = serializeSettings(mergedSettings)
    }
    if (remoteAppearance === null || hashValue(mergedAppearance) !== hashValue(remoteAppearance)) {
      patch.settings = mergedAppearance
    }

    if (Object.keys(patch).length > 0) {
      setStatus("saving")
      const version = await saveDashboard(userId, patch, row)
      // Another device saved first: merge again, against its copy.
      if (!version) return "retry"
      rememberOwnVersion(version)
    }
  }

  // The base only moves for data this device now actually holds - if a write
  // above was skipped, the old base is what still describes it.
  await writeMeta({
    userId,
    todos: todosWritten ? snapshotOf(mergedTodos, cardId) : base.todos,
    sessions:
      syncSessions && sessionsWritten ? snapshotOf(mergedSessions, bundleId) : base.sessions,
    settings: settingsWritten ? hashUnits(mergedSettings) : base.settings,
    appearance: appearanceWritten ? hashUnits(mergedAppearance) : base.appearance,
  })

  return allWritten ? "done" : "retry"
}

async function syncOnce(userId: string, pull: boolean, options: SyncOptions): Promise<Outcome> {
  const bookmarks = await syncBookmarksOnce(userId, pull, options.bookmarks)
  const dashboard = await syncDashboardOnce(userId, pull, options.syncSessions)
  if (!isOnline()) {
    setStatus("offline")
  } else {
    publish({ ...state, status: "synced", lastSyncedAt: Date.now() })
  }
  return bookmarks === "retry" || dashboard === "retry" ? "retry" : "done"
}

/* -------------------------------------------------------------------------- */
/* Scheduling                                                                  */
/* -------------------------------------------------------------------------- */

/** chrome.storage.local keys that sync. */
function isSyncedKey(key: string): boolean {
  return (
    key === KANBAN_STORAGE_KEY ||
    key === SESSIONS_STORAGE_KEY ||
    key === APPEARANCE_STORAGE_KEY ||
    (key.startsWith("bm:ws:") && key.endsWith(":dashboard-columns"))
  )
}

/** localStorage keys that sync: hidden folders and each card's list/grid view. */
function isSyncedSettingKey(key: string): boolean {
  return (key.startsWith("bm:ws:") && key.endsWith(":hidden-folders")) || key.startsWith("bm:view:")
}

interface SyncSession {
  /** Syncs right away, skipping any wait - including an error's back-off. */
  syncNow: () => void
  stop: () => void
}

export interface SyncOptions {
  /** Saved sessions sync on Pro only (lib/bundle-gate.ts). */
  syncSessions: boolean
  /** This device's "Sync Bookmarks" setting (lib/bookmark-sync.ts). */
  bookmarks: BookmarkSyncPref
  /**
   * Pull the moment another device saves (Pro's "Real-Time Live Sync") rather
   * than on the next poll - in hidden tabs too, so switching to one shows it
   * already up to date.
   */
  live: boolean
}

/** Starts syncing for `userId`. */
function attach(userId: string, options: SyncOptions): SyncSession {
  let stopped = false
  let running = false
  let queued = false
  let pullPending = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let timerDueAt = Infinity
  let lastPullAt = 0
  let retryDelay = RETRY_DELAY_MS

  function request(pull: boolean, delay: number) {
    if (stopped) return
    if (pull) pullPending = true
    if (running) {
      queued = true
      return
    }
    // A sync already due sooner covers this request too.
    const dueAt = Date.now() + delay
    if (timer !== undefined && timerDueAt <= dueAt) return
    clearTimeout(timer)
    timerDueAt = dueAt
    timer = setTimeout(() => void run(), delay)
  }

  async function run() {
    timer = undefined
    timerDueAt = Infinity
    running = true
    const pull = pullPending
    pullPending = false
    let outcome: Outcome = "retry"
    try {
      for (let attempt = 0; attempt < MAX_ATTEMPTS && outcome === "retry" && !stopped; attempt++) {
        outcome = await withSyncLock(() => syncOnce(userId, pull || attempt > 0, options))
      }
      if (pull) lastPullAt = Date.now()
    } catch (error) {
      if (!stopped) {
        console.warn("[StashWell] Sync failed - retrying shortly:", error)
        setStatus(isOnline() ? "error" : "offline")
      }
    } finally {
      running = false
    }
    if (stopped) return

    if (outcome === "done") {
      retryDelay = RETRY_DELAY_MS
    } else {
      // Failed, or kept losing races: back off, so a problem that doesn't
      // clear up on its own can't turn into a request every few seconds.
      request(true, retryDelay)
      retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY_MS)
    }
    if (queued) {
      queued = false
      request(false, LOCAL_CHANGE_DELAY_MS)
    }
  }

  function onStorageChanged(
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: chrome.storage.AreaName
  ) {
    if (areaName !== "local") return
    if (Object.keys(changes).some(isSyncedKey)) request(false, LOCAL_CHANGE_DELAY_MS)
  }

  function onVisibilityChange() {
    if (document.visibilityState !== "visible") return
    if (Date.now() - lastPullAt >= FOCUS_PULL_THROTTLE_MS) request(true, 0)
  }

  function onOnline() {
    request(true, 0)
  }

  function onOffline() {
    setStatus("offline")
  }

  chrome.storage.onChanged.addListener(onStorageChanged)
  const unsubscribeSettings = subscribeLocalSettings((key) => {
    if (isSyncedSettingKey(key)) request(false, LOCAL_CHANGE_DELAY_MS)
  })
  // Uploads bookmark edits, and lets a folder arriving from another device take
  // the card slot that device gave it (see rehydrate in
  // lib/dashboard-sync-layouts.ts) - hence a pull, not just a push.
  // With "Sync Bookmarks" off, Chrome's bookmark events aren't listened to at all.
  const unsubscribeBookmarks =
    hasBookmarksApi() && options.bookmarks !== "off"
      ? subscribeToChanges(() => request(true, LOCAL_CHANGE_DELAY_MS))
      : () => {}
  document.addEventListener("visibilitychange", onVisibilityChange)
  window.addEventListener("online", onOnline)
  window.addEventListener("offline", onOffline)
  const unsubscribeRemote = options.live
    ? subscribeRemoteChanges(
        userId,
        (version) => {
          if (!isOwnVersion(version)) request(true, REMOTE_CHANGE_DELAY_MS)
        },
        // Anything saved while disconnected sent no event.
        () => request(true, 0)
      )
    : () => {}
  const poll = setInterval(() => {
    if (document.visibilityState === "visible") request(true, 0)
  }, POLL_INTERVAL_MS)

  if (!isOnline()) setStatus("offline")
  request(true, 0)

  return {
    syncNow() {
      retryDelay = RETRY_DELAY_MS
      request(true, 0)
    },
    stop() {
      stopped = true
      clearTimeout(timer)
      clearInterval(poll)
      chrome.storage.onChanged.removeListener(onStorageChanged)
      unsubscribeSettings()
      unsubscribeBookmarks()
      unsubscribeRemote()
      document.removeEventListener("visibilitychange", onVisibilityChange)
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
    },
  }
}

let active: { key: string; refs: number; session: SyncSession } | null = null

/**
 * Starts syncing this user's dashboard in this tab, and returns the function
 * that stops it. Reference-counted, so a double mount (React Strict Mode)
 * doesn't sync twice; starting for a different user - or the same user with
 * different options, e.g. after upgrading to Pro - replaces the previous one.
 */
export function startDashboardSync(userId: string, options: SyncOptions): () => void {
  if (!hasStorageApi()) return () => {}

  const key = `${userId}:${options.syncSessions}:${options.bookmarks}:${options.live}`
  if (active && active.key !== key) {
    active.session.stop()
    active = null
  }
  if (!active) active = { key, refs: 0, session: attach(userId, options) }
  const current = active
  current.refs += 1

  let released = false
  return () => {
    if (released) return
    released = true
    current.refs -= 1
    if (current.refs > 0 || active !== current) return
    current.session.stop()
    active = null
    publish(IDLE_SYNC_STATE)
  }
}

/** The Sync settings' "Sync now". No-op while signed out. */
export function syncNow(): void {
  active?.session.syncNow()
}
