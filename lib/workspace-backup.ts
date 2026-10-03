/**
 * Backup files, and restoring one - the Privacy panel's "Export my data" and
 * "Restore from backup" rows.
 *
 * A backup holds every workspace's dashboard - every folder and bookmark in
 * its original order, each card's column and slot, which cards were hidden and
 * which showed as a grid - plus the kanban board and saved sessions. Each
 * workspace in the file is matched to one here by id, then name, and created
 * when there's no match. Restoring then works one of two ways:
 *
 *  - Smart Merge (mergeBackup) only ever adds: the bookmarks, folders, tasks
 *    and saved sessions in the file that aren't here yet. Nothing here is
 *    removed, moved, renamed or rearranged.
 *  - Replace (restoreBackup) puts every matched workspace and the kanban board
 *    back exactly as the file has them, deleting what they hold now. Saved
 *    sessions are left alone.
 *
 * Either way, workspaces that aren't in the file are left alone.
 *
 * Restoring can't reuse Chrome ids: it has to create fresh folders, while the
 * layout, hidden list and view modes all name folders by id. So every saved
 * node keeps the id it had at export, purely so those can be re-pointed at the
 * folders recreated in its place.
 */

import {
  type BookmarkNode,
  OTHER_BOOKMARKS_ID,
  createBookmark,
  createFolder,
  findNode,
  getTree,
  isFolder,
  moveNode,
  removeNode,
} from "@/lib/bookmarks"
import {
  type Columns,
  type DashboardLayout,
  parseDashboardLayout,
  readDashboardLayout,
  writeDashboardLayout,
} from "@/lib/dashboard-layout-storage"
import { pushDashboardLayout } from "@/lib/dashboard-layout-sync"
import { readFolderViewMode, writeFolderViewMode } from "@/lib/folder-view-mode"
import { readHiddenFolders, writeHiddenFolders } from "@/lib/hidden-folders"
import {
  type KanbanCard,
  missingKanbanCards,
  parseKanbanCards,
  readKanbanCards,
  updateKanbanCards,
} from "@/lib/kanban"
import {
  type SessionBundle,
  addSessionBundles,
  downloadTextFile,
  missingSessionBundles,
  parseSessionBundles,
  readSessionBundles,
} from "@/lib/session-bundles"
import {
  DEFAULT_EMOJI,
  type Workspace,
  ensureWorkspacesContainer,
  newWorkspaceId,
} from "@/lib/workspaces"

const BACKUP_FORMAT = "stashwell-backup"
const BACKUP_VERSION = 2

/** A folder or bookmark as saved in a backup file. */
export interface BackupNode {
  /** Chrome id at export time - see the header. Absent in files from before version 2. */
  id?: string
  title: string
  url?: string
  children?: BackupNode[]
}

/** Everything one workspace's dashboard is made of, as saved in a backup file. */
export interface WorkspaceSnapshot {
  id: string
  name: string
  emoji: string
  /** The workspace folder's id at export - also the Unsorted card's id in `layout`. */
  folderId: string
  /** The folder's children, in Chrome order. Each child folder is a card. */
  bookmarks: BackupNode[]
  layout: DashboardLayout | null
  hiddenFolders: string[]
  /** Cards showing as a grid. Every other card shows as a list. */
  gridFolders: string[]
}

export interface StashWellBackup {
  format: typeof BACKUP_FORMAT
  version: typeof BACKUP_VERSION
  exportedAt: string
  workspaces: WorkspaceSnapshot[]
  /** The whole kanban board, in board order - it isn't per workspace. */
  tasks: KanbanCard[]
  /** Saved tab sessions - a Smart Merge adds the missing ones, a replace leaves them alone. */
  sessions?: SessionBundle[]
}

/* -------------------------------------------------------------------------- */
/* Export                                                                      */
/* -------------------------------------------------------------------------- */

function toBackupNode(node: BookmarkNode): BackupNode {
  if (node.url !== undefined) {
    return { id: node.id, title: node.title, url: node.url }
  }
  return { id: node.id, title: node.title, children: (node.children ?? []).map(toBackupNode) }
}

/**
 * Captures a workspace's dashboard. `root` is its live folder. `workspaceFolderIds`
 * is every workspace's folder: one dragged in here isn't a card on this
 * dashboard (see components/bookmarks/dashboard-view.tsx), so it isn't saved as
 * part of this workspace either.
 */
export async function snapshotWorkspace(
  workspace: { id: string; name: string; emoji: string },
  root: BookmarkNode,
  workspaceFolderIds: ReadonlySet<string>
): Promise<WorkspaceSnapshot> {
  const children = (root.children ?? []).filter((child) => !workspaceFolderIds.has(child.id))

  let layout: DashboardLayout | null = null
  try {
    layout = await readDashboardLayout(workspace.id)
  } catch {
    // Unreadable right now: the file still restores every bookmark, just with
    // the cards laid out in bookmark order.
  }

  const cardIds = [root.id, ...children.filter(isFolder).map((node) => node.id)]

  return {
    id: workspace.id,
    name: workspace.name,
    emoji: workspace.emoji,
    folderId: root.id,
    bookmarks: children.map(toBackupNode),
    layout,
    hiddenFolders: readHiddenFolders(workspace.id),
    gridFolders: cardIds.filter((id) => readFolderViewMode(id) === "grid"),
  }
}

/** Downloads a backup file holding `contents`. */
export function downloadBackup(
  filename: string,
  contents: Pick<StashWellBackup, "workspaces" | "tasks" | "sessions">
): void {
  const payload: StashWellBackup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    ...contents,
  }

  downloadTextFile(filename, JSON.stringify(payload, null, 2), "application/json")
}

/* -------------------------------------------------------------------------- */
/* Reading a file                                                              */
/* -------------------------------------------------------------------------- */

/** One workspace a file can restore, in the same shape whichever version wrote it. */
export interface SavedWorkspace {
  id: string
  name: string
  emoji: string
  /** The saved folder's id at export, or null for a file too old to have ids. */
  folderId: string | null
  bookmarks: BackupNode[]
  layout: DashboardLayout | null
  hiddenFolders: string[]
  gridFolders: string[]
  /**
   * A file from before version 2, which saved no layout, hidden list or view
   * modes. This device's own are re-pointed at the restored folders instead -
   * which puts every card back when the file was exported on this device,
   * since those still name the folders by the ids the file has.
   */
  legacy: boolean
}

export interface ParsedBackup {
  exportedAt: string
  workspaces: SavedWorkspace[]
  /**
   * A version-1 "Export my data" file saved no workspace list, only Chrome's
   * whole bookmark tree - each workspace's folder is looked up in it by id.
   */
  chromeTree: BackupNode[] | null
  /** Null when the file has no kanban board, which leaves the current one alone. */
  tasks: KanbanCard[] | null
  /** Null when the file has no saved sessions. */
  sessions: SessionBundle[] | null
}

function parseNode(raw: unknown): BackupNode | null {
  if (typeof raw !== "object" || raw === null) return null
  const candidate = raw as Record<string, unknown>
  const id = typeof candidate.id === "string" ? candidate.id : undefined
  const title = typeof candidate.title === "string" ? candidate.title : ""

  if (typeof candidate.url === "string") return { id, title, url: candidate.url }
  return {
    id,
    title,
    children: Array.isArray(candidate.children) ? parseNodes(candidate.children) : [],
  }
}

function parseNodes(raw: unknown[]): BackupNode[] {
  return raw.map(parseNode).filter((node): node is BackupNode => node !== null)
}

function parseIds(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : []
}

function parseEmoji(raw: unknown): string {
  return typeof raw === "string" && raw ? raw : DEFAULT_EMOJI
}

function parseSnapshot(raw: unknown): SavedWorkspace | null {
  if (typeof raw !== "object" || raw === null) return null
  const candidate = raw as Record<string, unknown>
  if (typeof candidate.id !== "string" || !Array.isArray(candidate.bookmarks)) return null

  return {
    id: candidate.id,
    name: typeof candidate.name === "string" ? candidate.name : "",
    emoji: parseEmoji(candidate.emoji),
    folderId: typeof candidate.folderId === "string" ? candidate.folderId : null,
    bookmarks: parseNodes(candidate.bookmarks),
    layout: parseDashboardLayout(candidate.layout),
    hiddenFolders: parseIds(candidate.hiddenFolders),
    gridFolders: parseIds(candidate.gridFolders),
    legacy: false,
  }
}

/**
 * Reads a backup file, or returns null if it isn't one. Accepts the current
 * format and both older ones: a version-1 workspace backup (one bare folder
 * tree with no ids, from the Bookmarks section's old "Export workspace") and a
 * version-1 "Export my data" file (Chrome's raw tree plus tasks and sessions).
 */
export function parseBackup(jsonText: string): ParsedBackup | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    return null
  }

  if (typeof parsed !== "object" || parsed === null) return null
  const candidate = parsed as Record<string, unknown>
  const exportedAt = typeof candidate.exportedAt === "string" ? candidate.exportedAt : ""

  if (candidate.format === BACKUP_FORMAT && candidate.version === BACKUP_VERSION) {
    if (!Array.isArray(candidate.workspaces)) return null
    return {
      exportedAt,
      workspaces: candidate.workspaces
        .map(parseSnapshot)
        .filter((workspace): workspace is SavedWorkspace => workspace !== null),
      chromeTree: null,
      tasks: parseKanbanCards(candidate.tasks),
      sessions: parseSessionBundles(candidate.sessions),
    }
  }

  if (candidate.version !== 1 || !Array.isArray(candidate.bookmarks)) return null
  const bookmarks = parseNodes(candidate.bookmarks)

  const workspace = candidate.workspace as Record<string, unknown> | undefined
  if (typeof workspace?.id === "string") {
    return {
      exportedAt,
      workspaces: [
        {
          id: workspace.id,
          name: typeof workspace.name === "string" ? workspace.name : "",
          emoji: DEFAULT_EMOJI,
          folderId: null,
          bookmarks,
          layout: null,
          hiddenFolders: [],
          gridFolders: [],
          legacy: true,
        },
      ],
      chromeTree: null,
      tasks: null,
      sessions: null,
    }
  }

  if (!Array.isArray(candidate.tasks)) return null
  return {
    exportedAt,
    workspaces: [],
    chromeTree: bookmarks,
    tasks: parseKanbanCards(candidate.tasks),
    sessions: parseSessionBundles(candidate.sessions),
  }
}

function findBackupNode(nodes: BackupNode[], id: string): BackupNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children) {
      const found = findBackupNode(node.children, id)
      if (found) return found
    }
  }
  return null
}

/** Counts every bookmark and folder in a backup or a live subtree, for the confirm dialog's "N items" wording. */
export function countItems(nodes: (BookmarkNode | BackupNode)[]): number {
  let count = 0
  for (const node of nodes) {
    count += 1
    if (node.url === undefined) count += countItems(node.children ?? [])
  }
  return count
}

export interface NodeCounts {
  bookmarks: number
  folders: number
}

/** Bookmarks and folders counted separately, for the restore dialog's summaries. */
export function countNodes(nodes: BackupNode[]): NodeCounts {
  const counts: NodeCounts = { bookmarks: 0, folders: 0 }
  function walk(list: BackupNode[]) {
    for (const node of list) {
      if (node.url !== undefined) {
        counts.bookmarks += 1
      } else {
        counts.folders += 1
        walk(node.children ?? [])
      }
    }
  }
  walk(nodes)
  return counts
}

/* -------------------------------------------------------------------------- */
/* Planning                                                                    */
/* -------------------------------------------------------------------------- */

/** One workspace a restore replaces, merges into, or creates. */
export interface RestoreTarget {
  saved: SavedWorkspace
  /** The workspace here it matches, or null when the restore creates it. */
  workspace: Workspace | null
  /** Items that workspace holds now, every one of which a replace deletes. */
  currentItemCount: number
  /** What a Smart Merge adds - the whole file's workspace when it's created. */
  mergeAdds: NodeCounts
}

export interface RestorePlan {
  exportedAt: string
  targets: RestoreTarget[]
  tasks: KanbanCard[] | null
  sessions: SessionBundle[] | null
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/** Saved nodes to create under one existing folder - everything a Smart Merge adds is a list of these. */
interface MergeAddition {
  parentId: string
  nodes: BackupNode[]
}

/** Every folder and bookmark in a live workspace by id, skipping other workspaces' folders dragged into it. */
function indexWorkspace(
  root: BookmarkNode,
  workspaceFolderIds: ReadonlySet<string>
): Map<string, BookmarkNode> {
  const index = new Map<string, BookmarkNode>()
  function walk(node: BookmarkNode) {
    for (const child of node.children ?? []) {
      if (workspaceFolderIds.has(child.id)) continue
      index.set(child.id, child)
      if (isFolder(child)) walk(child)
    }
  }
  walk(root)
  return index
}

/**
 * Works out what a Smart Merge adds to a workspace that already exists: every
 * saved bookmark and folder it doesn't have yet, each under the live folder
 * matching its saved parent. Pure, so the confirm dialog can count the result
 * before anything is written; mergeTarget runs it again on a fresh tree.
 *
 * A saved node is already here when the workspace still has its id - the same
 * bookmark or folder on this device, even if it's been moved or renamed since
 * the export. Otherwise a bookmark is already here when its folder has one
 * with the same URL, and a folder matches the one with the same name in the
 * same place (a file from another device, where ids differ), whose contents
 * are then merged the same way. A folder with no match is added whole.
 */
function planMerge(
  saved: BackupNode[],
  root: BookmarkNode,
  workspaceFolderIds: ReadonlySet<string>
): MergeAddition[] {
  const index = indexWorkspace(root, workspaceFolderIds)
  // A live folder takes in one saved folder at most.
  const claimed = new Set<string>()
  const additions: MergeAddition[] = []

  function liveFolder(id: string | undefined): BookmarkNode | null {
    const node = id ? index.get(id) : undefined
    return node && isFolder(node) && !claimed.has(node.id) ? node : null
  }

  function mergeInto(nodes: BackupNode[], live: BookmarkNode) {
    const children = (live.children ?? []).filter((child) => !workspaceFolderIds.has(child.id))
    const urls = new Set(children.flatMap((child) => (child.url ? [child.url] : [])))

    // Ids first, so a name match can't claim a folder another saved one matches exactly.
    const folderMatches = new Map<BackupNode, BookmarkNode>()
    for (const node of nodes) {
      const match = node.url === undefined ? liveFolder(node.id) : null
      if (!match) continue
      folderMatches.set(node, match)
      claimed.add(match.id)
    }
    for (const node of nodes) {
      if (node.url !== undefined || folderMatches.has(node)) continue
      const match = children.find(
        (child) => isFolder(child) && !claimed.has(child.id) && sameName(child.title, node.title)
      )
      if (!match) continue
      folderMatches.set(node, match)
      claimed.add(match.id)
    }

    const toAdd: BackupNode[] = []
    for (const node of nodes) {
      if (node.url !== undefined) {
        if ((node.id && index.has(node.id)) || urls.has(node.url)) continue
        // Also stops the file's own repeat of a URL in one folder doubling up.
        urls.add(node.url)
        toAdd.push(node)
        continue
      }
      const match = folderMatches.get(node)
      if (match) mergeInto(node.children ?? [], match)
      else toAdd.push(node)
    }
    if (toAdd.length > 0) additions.push({ parentId: live.id, nodes: toAdd })
  }

  mergeInto(saved, root)
  return additions
}

/**
 * Works out what restoring `backup` does to `workspaces`, for the confirm
 * dialog and then restoreBackup or mergeBackup. Each saved workspace matches
 * the one here with its id (a file from this device), else the one with its
 * name (a file from another device, where workspace ids differ), else becomes
 * a new workspace. An old "Export my data" file has no workspace list, so
 * there it's the other way round: each workspace here is restored from its own
 * folder in the file's tree, if the file has it. Returns an error message for
 * the settings row when the file has nothing to restore.
 */
export function planRestore(
  backup: ParsedBackup,
  workspaces: Workspace[],
  tree: BookmarkNode[]
): RestorePlan | { error: string } {
  const workspaceFolderIds = new Set(workspaces.map((workspace) => workspace.folderId))
  function liveRoot(workspace: Workspace | null): BookmarkNode | null {
    const root = workspace ? findNode(tree, workspace.folderId) : null
    return root && isFolder(root) ? root : null
  }

  function target(saved: SavedWorkspace, workspace: Workspace | null): RestoreTarget {
    const root = liveRoot(workspace)
    return {
      saved,
      workspace,
      // Another workspace's folder dragged in here is left alone by a restore.
      currentItemCount: root
        ? countItems((root.children ?? []).filter((child) => !workspaceFolderIds.has(child.id)))
        : 0,
      mergeAdds: countNodes(
        root
          ? planMerge(saved.bookmarks, root, workspaceFolderIds).flatMap((addition) => addition.nodes)
          : saved.bookmarks
      ),
    }
  }

  const targets: RestoreTarget[] = []
  const { chromeTree } = backup

  if (chromeTree) {
    for (const workspace of workspaces) {
      const folder = findBackupNode(chromeTree, workspace.folderId)
      if (!folder?.children) continue
      targets.push(
        target(
          {
            id: workspace.id,
            name: workspace.name,
            emoji: workspace.emoji,
            folderId: workspace.folderId,
            bookmarks: folder.children,
            layout: null,
            hiddenFolders: [],
            gridFolders: [],
            legacy: true,
          },
          workspace
        )
      )
    }
  } else {
    // Ids first, across the whole file, so a name match can't claim a
    // workspace another saved one matches exactly.
    const matches = new Map<SavedWorkspace, Workspace>()
    const claimed = new Set<string>()
    for (const saved of backup.workspaces) {
      const workspace = workspaces.find((candidate) => candidate.id === saved.id)
      if (workspace && !claimed.has(workspace.id)) {
        matches.set(saved, workspace)
        claimed.add(workspace.id)
      }
    }
    for (const saved of backup.workspaces) {
      if (matches.has(saved)) continue
      const workspace = workspaces.find(
        (candidate) => !claimed.has(candidate.id) && sameName(candidate.name, saved.name)
      )
      if (workspace) {
        matches.set(saved, workspace)
        claimed.add(workspace.id)
      }
    }

    for (const saved of backup.workspaces) {
      targets.push(target(saved, matches.get(saved) ?? null))
    }
  }

  if (targets.length === 0) {
    return {
      error: chromeTree
        ? "This backup doesn't include any of your workspaces."
        : "This backup doesn't include any workspaces.",
    }
  }
  return { exportedAt: backup.exportedAt, targets, tasks: backup.tasks, sessions: backup.sessions }
}

/** The confirm dialog's counts that depend on the tasks and sessions stored here, not on bookmarks. */
export interface RestoreCounts {
  /** Tasks on the board now - every one of which a replace swaps out. */
  currentTasks: number
  /** Tasks and saved sessions a Smart Merge adds. */
  newTasks: number
  newSessions: number
}

export async function readRestoreCounts(plan: RestorePlan): Promise<RestoreCounts> {
  const [tasks, sessions] = await Promise.all([readKanbanCards(), readSessionBundles()])
  return {
    currentTasks: tasks.length,
    newTasks: plan.tasks ? missingKanbanCards(tasks, plan.tasks).length : 0,
    newSessions: plan.sessions ? missingSessionBundles(sessions, plan.sessions).length : 0,
  }
}

/* -------------------------------------------------------------------------- */
/* Replace                                                                     */
/* -------------------------------------------------------------------------- */

const STAGING_TITLE = "StashWell restore in progress"

/**
 * Recreates `nodes` under `parentId`, recording each saved id's replacement in
 * `idMap`, and returns the top-level nodes it created. Sequential for the same
 * reason as lib/bookmark-copy.ts's copy: create() appends to the parent, so
 * awaiting each in turn is what keeps the saved order. Unlike an import, empty
 * untitled folders are kept - they were cards on the dashboard.
 */
async function createNodes(
  nodes: BackupNode[],
  parentId: string,
  idMap: Map<string, string>
): Promise<BookmarkNode[]> {
  const created: BookmarkNode[] = []
  for (const node of nodes) {
    const next =
      node.url !== undefined
        ? await createBookmark({ parentId, title: node.title, url: node.url })
        : await createFolder({ parentId, title: node.title })
    if (!next) throw new Error("chrome.bookmarks is unavailable")

    if (node.id) idMap.set(node.id, next.id)
    if (node.children?.length) await createNodes(node.children, next.id, idMap)
    created.push(next)
  }
  return created
}

/** Swaps each id for its replacement, dropping any the restore didn't recreate. */
function remapIds(ids: string[], idMap: Map<string, string>): string[] {
  return ids.flatMap((id) => {
    const next = idMap.get(id)
    return next ? [next] : []
  })
}

function remapLayout(layout: DashboardLayout, idMap: Map<string, string>): DashboardLayout {
  const byCount: Record<string, Columns> = {}
  for (const [count, columns] of Object.entries(layout.byCount)) {
    byCount[count] = columns.map((column) => remapIds(column, idMap))
  }
  return { ...layout, byCount }
}

/**
 * Restores one workspace. Its tree is built in a scratch folder outside every
 * workspace first, and only swapped in once all of it exists: a failure while
 * building leaves the workspace exactly as it was instead of half-deleted.
 *
 * Replacing a workspace that has a folder, the order after that matters as
 * well. The dashboard saves an arrangement of its own whenever it sees a card
 * its saved one doesn't know (see hooks/use-card-columns.ts). If the new
 * folders appeared before the restored layout was stored, every open dashboard
 * would append them to its old arrangement and write that back, racing - and
 * usually beating - the restored one. So the old cards go first (a removal
 * never triggers a save), then the layout naming the new ids is stored, and
 * only then do the new folders move in, each already placed. Moving keeps a
 * node's id, so nothing needs re-pointing after the move.
 *
 * A workspace with no folder - one this device doesn't have yet, or whose
 * folder was deleted in Chrome - gets a new one, built in staging the same way
 * and moved into the workspaces container once it's registered.
 */
async function restoreTarget(
  target: RestoreTarget,
  workspaceFolderIds: ReadonlySet<string>,
  registerWorkspace: (workspace: Workspace) => void
): Promise<void> {
  const { saved } = target
  const live = target.workspace ? findNode(await getTree(), target.workspace.folderId) : null
  const root = live && isFolder(live) ? live : null

  const staging = await createFolder({ parentId: OTHER_BOOKMARKS_ID, title: STAGING_TITLE })
  if (!staging) throw new Error("chrome.bookmarks is unavailable")

  // Saved id -> the id of the node recreated in its place. The saved folder
  // itself maps onto the workspace's folder, which is kept, not recreated.
  const idMap = new Map<string, string>()
  let folder = root
  let created: BookmarkNode[]
  try {
    folder ??= await createFolder({
      parentId: staging.id,
      title: target.workspace?.name || saved.name,
    })
    if (!folder) throw new Error("chrome.bookmarks is unavailable")
    idMap.set(saved.folderId ?? folder.id, folder.id)
    // An existing folder's new contents wait loose in staging to be moved in;
    // a new folder is built complete, contents and all.
    created = await createNodes(saved.bookmarks, root ? staging.id : folder.id, idMap)
  } catch (error) {
    await removeNode(staging.id, true).catch(() => {})
    throw error
  }

  const workspace: Workspace = target.workspace
    ? { ...target.workspace, folderId: folder.id }
    : {
        id: newWorkspaceId(),
        name: saved.name.trim() || "Restored",
        emoji: saved.emoji,
        folderId: folder.id,
        createdAt: Date.now(),
      }

  // An older file carries none of these, so this device's own are re-pointed -
  // read now, before anything below overwrites them.
  const layout = saved.legacy
    ? await readDashboardLayout(workspace.id).catch(() => null)
    : saved.layout
  const hidden = saved.legacy ? readHiddenFolders(workspace.id) : saved.hiddenFolders
  const grid = saved.legacy
    ? [...idMap.keys()].filter((id) => readFolderViewMode(id) === "grid")
    : saved.gridFolders

  if (root) {
    const current = findNode(await getTree(), root.id)
    for (const child of current?.children ?? []) {
      if (workspaceFolderIds.has(child.id)) continue
      await removeNode(child.id, isFolder(child))
    }
  }

  const gridIds = new Set(remapIds(grid, idMap))
  const cardIds = [folder.id, ...created.filter(isFolder).map((node) => node.id)]
  for (const id of cardIds) writeFolderViewMode(id, gridIds.has(id) ? "grid" : "list")
  writeHiddenFolders(workspace.id, remapIds(hidden, idMap))

  if (layout) {
    const restored = remapLayout(layout, idMap)
    await writeDashboardLayout(workspace.id, restored)
    if (restored.arrangedByUser) pushDashboardLayout(workspace.id, restored)
  }

  if (root) {
    for (const node of created) {
      await moveNode(node.id, { parentId: root.id })
    }
  } else {
    // Registered before it moves into the container: the provider adopts any
    // container folder no workspace points at (lib/workspaces.ts's
    // adoptOrphanedFolders), which would give this one a second record.
    registerWorkspace(workspace)
    const containerId = await ensureWorkspacesContainer()
    if (!containerId) throw new Error("chrome.bookmarks is unavailable")
    await moveNode(folder.id, { parentId: containerId })
  }

  // remove(), not removeTree(): it refuses a folder that isn't empty, so
  // cleaning up can never take restored bookmarks with it.
  await removeNode(staging.id, false)
}

/**
 * Replace: carries out a plan from planRestore - every workspace in it, then
 * the kanban board, each put back exactly as the file has it. Each workspace
 * is restored on its own, so one failing doesn't stop the rest - its name
 * comes back in `failed`, and it's left as it was. `workspaces` is every
 * workspace here; `registerWorkspace` records one the restore created or gave
 * a new folder (the provider's registerWorkspace).
 */
export async function restoreBackup(
  plan: RestorePlan,
  workspaces: Workspace[],
  registerWorkspace: (workspace: Workspace) => void
): Promise<{ failed: string[] }> {
  const workspaceFolderIds = new Set(workspaces.map((workspace) => workspace.folderId))
  const failed: string[] = []

  for (const target of plan.targets) {
    try {
      await restoreTarget(target, workspaceFolderIds, registerWorkspace)
    } catch (error) {
      console.error("[StashWell] Couldn't restore a workspace:", error)
      failed.push(target.workspace?.name ?? target.saved.name)
    }
  }

  const tasks = plan.tasks
  if (tasks) await updateKanbanCards(() => tasks)

  return { failed }
}

/* -------------------------------------------------------------------------- */
/* Smart Merge                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Merges one workspace. A workspace here gets planMerge's additions, worked
 * out again on a fresh tree, each created at the end of its folder - a new
 * card is placed on the dashboard the way any new folder is (see
 * hooks/use-card-columns.ts), so nothing already arranged moves. A new card
 * the file had hidden, or showing as a grid, comes in hidden or as a grid;
 * every card already here keeps its own settings.
 *
 * With nothing to merge into - no workspace matched, or its folder is gone -
 * the file's workspace is created whole, exactly as a replace would.
 *
 * Unlike a replace this isn't staged: it only adds, so a failure partway
 * leaves what was already added, and merging the same file again skips that
 * and adds the rest.
 */
async function mergeTarget(
  target: RestoreTarget,
  workspaceFolderIds: ReadonlySet<string>,
  registerWorkspace: (workspace: Workspace) => void
): Promise<NodeCounts> {
  const { saved, workspace } = target
  const live = workspace ? findNode(await getTree(), workspace.folderId) : null
  if (!workspace || !live || !isFolder(live)) {
    await restoreTarget(target, workspaceFolderIds, registerWorkspace)
    return countNodes(saved.bookmarks)
  }

  const additions = planMerge(saved.bookmarks, live, workspaceFolderIds)
  // Saved id -> new id, for the folders (and bookmarks) this merge creates.
  const idMap = new Map<string, string>()
  for (const { parentId, nodes } of additions) {
    await createNodes(nodes, parentId, idMap)
  }

  const hidden = remapIds(saved.hiddenFolders, idMap)
  if (hidden.length > 0) {
    writeHiddenFolders(workspace.id, [...new Set([...readHiddenFolders(workspace.id), ...hidden])])
  }
  for (const id of remapIds(saved.gridFolders, idMap)) writeFolderViewMode(id, "grid")

  return countNodes(additions.flatMap((addition) => addition.nodes))
}

export interface MergeResult {
  /** Workspaces that couldn't be fully merged - see mergeTarget. */
  failed: string[]
  added: NodeCounts & { workspaces: number; tasks: number; sessions: number }
}

/**
 * Smart Merge: carries out a plan from planRestore by adding only what isn't
 * here yet - bookmarks and folders into each matched workspace, any workspace
 * with no match, then the board's missing tasks (missingKanbanCards) and
 * missing saved sessions (addSessionBundles). Nothing already here is
 * removed, replaced or rearranged. Arguments as for restoreBackup.
 */
export async function mergeBackup(
  plan: RestorePlan,
  workspaces: Workspace[],
  registerWorkspace: (workspace: Workspace) => void
): Promise<MergeResult> {
  const workspaceFolderIds = new Set(workspaces.map((workspace) => workspace.folderId))
  const failed: string[] = []
  const added: MergeResult["added"] = { workspaces: 0, bookmarks: 0, folders: 0, tasks: 0, sessions: 0 }

  for (const target of plan.targets) {
    try {
      const counts = await mergeTarget(target, workspaceFolderIds, registerWorkspace)
      if (!target.workspace) added.workspaces += 1
      added.bookmarks += counts.bookmarks
      added.folders += counts.folders
    } catch (error) {
      console.error("[StashWell] Couldn't merge a workspace:", error)
      failed.push(target.workspace?.name ?? target.saved.name)
    }
  }

  const tasks = plan.tasks
  if (tasks) {
    await updateKanbanCards((current) => {
      const missing = missingKanbanCards(current, tasks)
      added.tasks = missing.length
      return missing.length > 0 ? [...current, ...missing] : current
    })
  }
  if (plan.sessions) added.sessions = await addSessionBundles(plan.sessions)

  return { failed, added }
}
