/**
 * Workspaces: named, emoji-tagged contexts that each own a slice of the user's
 * bookmarks plus their own notes and reminders.
 *
 * Bookmarks are real Chrome bookmarks, so isolation is backed by real folders:
 *  - Workspace "default" maps to the Bookmarks Bar, so nothing the user already
 *    had moves when the feature ships.
 *  - Every other workspace gets a real folder under
 *    Other Bookmarks > "StashWell Workspaces".
 *
 * The governing rule for the whole feature: a workspace's folder resolves
 * EXACTLY, or the workspace reports a problem. There is never a fallback to the
 * tree root or to the Bookmarks Bar - that is precisely how one workspace's
 * bookmarks would leak into another.
 */

import {
  BOOKMARKS_BAR_ID,
  type BookmarkNode,
  OTHER_BOOKMARKS_ID,
  createFolder,
  findNode,
  getTree,
  hasBookmarksApi,
  isFolder,
} from "@/lib/bookmarks"
import { clearWorkspaceData, migrateGlobalKey } from "@/lib/workspace-storage"

export interface Workspace {
  id: string
  name: string
  emoji: string
  /** Chrome bookmarks folder id backing this workspace. */
  folderId: string
  createdAt: number
}

export interface WorkspaceState {
  version: number
  workspaces: Workspace[]
  activeId: string
}

const STORAGE_KEY = "bm:workspaces"
const STATE_VERSION = 1

export const CONTAINER_TITLE = "StashWell Workspaces"
export const DEFAULT_WORKSPACE_ID = "default"

/**
 * The first workspace is a synchronous constant, not the result of a Chrome
 * call. That is what keeps the app usable in `next dev`, where chrome.bookmarks
 * doesn't exist at all: there is always at least one workspace to render.
 */
export const DEFAULT_WORKSPACE: Workspace = {
  id: DEFAULT_WORKSPACE_ID,
  name: "Personal",
  emoji: "🏠",
  folderId: BOOKMARKS_BAR_ID,
  createdAt: 0,
}

export const DEFAULT_EMOJI = "🗂️"

/* -------------------------------------------------------------------------- */
/* Persistence                                                                 */
/* -------------------------------------------------------------------------- */

function isWorkspace(value: unknown): value is Workspace {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as Partial<Workspace>
  return (
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    // Ids become part of a localStorage key prefix (`bm:ws:<id>:`), so a ":"
    // would let one workspace read or sweep a sibling's data.
    !candidate.id.includes(":") &&
    typeof candidate.name === "string" &&
    typeof candidate.emoji === "string" &&
    typeof candidate.folderId === "string" &&
    candidate.folderId.length > 0 &&
    typeof candidate.createdAt === "number"
  )
}

/** Guarantees a usable state: the default workspace present, activeId valid. */
function normalizeState(state: WorkspaceState): WorkspaceState {
  const seen = new Set<string>()
  const workspaces = state.workspaces.filter((workspace) => {
    if (seen.has(workspace.id)) return false
    seen.add(workspace.id)
    return true
  })

  if (!workspaces.some((workspace) => workspace.id === DEFAULT_WORKSPACE_ID)) {
    workspaces.unshift(DEFAULT_WORKSPACE)
  }

  const activeId = workspaces.some((workspace) => workspace.id === state.activeId)
    ? state.activeId
    : DEFAULT_WORKSPACE_ID

  return { version: STATE_VERSION, workspaces, activeId }
}

export function readWorkspaceState(): WorkspaceState {
  const empty: WorkspaceState = {
    version: STATE_VERSION,
    workspaces: [DEFAULT_WORKSPACE],
    activeId: DEFAULT_WORKSPACE_ID,
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return empty

    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return empty

    const candidate = parsed as Partial<WorkspaceState>
    const workspaces = Array.isArray(candidate.workspaces)
      ? candidate.workspaces.filter(isWorkspace)
      : []

    return normalizeState({
      version: typeof candidate.version === "number" ? candidate.version : 0,
      workspaces,
      activeId: typeof candidate.activeId === "string" ? candidate.activeId : DEFAULT_WORKSPACE_ID,
    })
  } catch {
    return empty
  }
}

export function writeWorkspaceState(state: WorkspaceState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state)))
  } catch {
    // ignore write failures (storage disabled, quota exceeded)
  }
}

/**
 * Moves the pre-workspaces global keys into the default workspace's namespace,
 * so an existing user's card layout and hidden folders survive the upgrade.
 *
 * Gated on the persisted state version rather than on "is the target key
 * absent" - the latter would resurrect an ancient layout for anyone who
 * legitimately cleared it. The legacy keys are left in place as a rollback path
 * and can be swept in a later release.
 *
 * Must be called synchronously before any per-workspace hook initializes, and
 * cannot live at module scope: this module is imported by "use client" code
 * that still executes in Node during the static-export prerender, where
 * `window` is undefined.
 */
export function runWorkspaceMigrations(state: WorkspaceState): WorkspaceState {
  if (state.version >= STATE_VERSION) return state

  try {
    migrateGlobalKey(DEFAULT_WORKSPACE_ID, "bm:hidden-folders", "hidden-folders")
    migrateGlobalKey(DEFAULT_WORKSPACE_ID, "bm:dashboard-columns", "dashboard-columns")
  } catch {
    // ignore
  }

  const migrated: WorkspaceState = { ...state, version: STATE_VERSION }
  writeWorkspaceState(migrated)
  return migrated
}

/* -------------------------------------------------------------------------- */
/* Chrome folder resolution                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Every folder under Other Bookmarks that looks like our container.
 *
 * Duplicates are a real state, not a defensive nicety: Chrome syncs bookmarks
 * but not localStorage, so two devices can each create a container before they
 * converge. The container id is deliberately never persisted - if it were, one
 * deletion in Chrome's own manager would strand every workspace at once.
 */
export function findContainerCandidates(tree: BookmarkNode[]): BookmarkNode[] {
  const other = findNode(tree, OTHER_BOOKMARKS_ID)
  if (!other?.children) return []
  return other.children.filter((node) => isFolder(node) && node.title === CONTAINER_TITLE)
}

/**
 * The container new workspaces get created in. Tie-broken on oldest first, then
 * numerically ascending id - never `children[0]`, which is user-reorderable and
 * would flip between devices.
 */
export function pickContainer(candidates: BookmarkNode[]): BookmarkNode | null {
  if (candidates.length === 0) return null
  return [...candidates].sort((a, b) => {
    const added = (a.dateAdded ?? 0) - (b.dateAdded ?? 0)
    if (added !== 0) return added
    return Number(a.id) - Number(b.id)
  })[0]
}

export type WorkspaceFolderStatus =
  /** Resolved to a real folder in the right place. */
  | "ok"
  /** chrome.bookmarks isn't available - normal in `next dev` in a plain tab. */
  | "no-api"
  /** The folder id no longer resolves; deleted from Chrome's own manager. */
  | "missing-folder"
  /** Resolves, but has been dragged outside the workspaces container. */
  | "misplaced"

export interface ResolvedWorkspace {
  workspace: Workspace
  status: WorkspaceFolderStatus
  node: BookmarkNode | null
}

/**
 * Resolves a workspace's backing folder, reporting a status instead of ever
 * falling back to another folder.
 *
 * Placement is validated by containment - walking `parentId` upward until any
 * container candidate is reached - rather than "is a direct child of the chosen
 * container". That way a workspace whose folder sits in a losing duplicate
 * container still resolves normally, while one that has been dragged onto the
 * Bookmarks Bar is reported as misplaced rather than quietly contaminating the
 * default workspace.
 */
export function resolveWorkspace(tree: BookmarkNode[], workspace: Workspace): ResolvedWorkspace {
  if (!hasBookmarksApi()) return { workspace, status: "no-api", node: null }

  // The Bookmarks Bar is permanent: it can't be deleted or moved, so it needs
  // no container check. While the tree is still loading, treat it as pending
  // rather than missing.
  if (workspace.folderId === BOOKMARKS_BAR_ID) {
    const bar = findNode(tree, BOOKMARKS_BAR_ID)
    return { workspace, status: bar ? "ok" : "missing-folder", node: bar }
  }

  // Resolve against the already-fetched tree rather than chrome.bookmarks.get(),
  // which rejects on a nonexistent id.
  const node = findNode(tree, workspace.folderId)
  // isFolder matters: a profile restored from a backed-up Bookmarks file
  // renumbers every id, so a saved id can land on a bookmark.
  if (!node || !isFolder(node)) return { workspace, status: "missing-folder", node: null }

  const containerIds = new Set(findContainerCandidates(tree).map((candidate) => candidate.id))
  let current: BookmarkNode | null = node
  while (current?.parentId) {
    if (containerIds.has(current.parentId)) return { workspace, status: "ok", node }
    current = findNode(tree, current.parentId)
  }

  return { workspace, status: "misplaced", node }
}

/* -------------------------------------------------------------------------- */
/* Folder provisioning                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Resolves the workspaces container, creating it if absent. Returns null when
 * chrome.bookmarks is unavailable, so callers can refuse to persist a workspace
 * with no real folder behind it.
 */
export async function ensureWorkspacesContainer(): Promise<string | null> {
  if (!hasBookmarksApi()) return null

  const tree = await getTree()
  const existing = pickContainer(findContainerCandidates(tree))
  if (existing) return existing.id

  const created = await createFolder({ parentId: OTHER_BOOKMARKS_ID, title: CONTAINER_TITLE })
  return created?.id ?? null
}

/** Creates the Chrome folder for a new workspace. Null if it can't be made. */
export async function createWorkspaceFolder(name: string): Promise<string | null> {
  const containerId = await ensureWorkspacesContainer()
  if (!containerId) return null

  const created = await createFolder({ parentId: containerId, title: name })
  return created?.id ?? null
}

/* -------------------------------------------------------------------------- */
/* Adoption                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Creates workspace records for container folders nothing references yet.
 *
 * Bookmark folders sync across devices; localStorage does not, and Chrome
 * assigns different bookmark ids per profile. Without this, a user who set up
 * workspaces on one machine opens the extension on a second and sees only the
 * default workspace, with their synced folders sitting orphaned in the
 * container. It also self-heals a cleared localStorage on the same machine.
 */
export function adoptOrphanedFolders(tree: BookmarkNode[], state: WorkspaceState): WorkspaceState {
  if (!hasBookmarksApi()) return state

  const candidates = findContainerCandidates(tree)
  if (candidates.length === 0) return state

  const known = new Set(state.workspaces.map((workspace) => workspace.folderId))
  const adopted: Workspace[] = []

  for (const container of candidates) {
    for (const folder of container.children ?? []) {
      if (!isFolder(folder) || known.has(folder.id)) continue
      known.add(folder.id)
      adopted.push({
        id: newWorkspaceId(),
        name: folder.title || "Untitled",
        emoji: DEFAULT_EMOJI,
        folderId: folder.id,
        createdAt: folder.dateAdded ?? Date.now(),
      })
    }
  }

  if (adopted.length === 0) return state
  return { ...state, workspaces: [...state.workspaces, ...adopted] }
}

/* -------------------------------------------------------------------------- */
/* Ids                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Ids are random, never derived from the user's name: they become part of a
 * localStorage key prefix, so a name containing ":" would let one workspace
 * read or delete a sibling's data.
 */
export function newWorkspaceId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `ws-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }
}

export { clearWorkspaceData }
