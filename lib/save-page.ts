/**
 * Save Bookmark in the toolbar popup: files the current tab's page into one of
 * the dashboard's cards - in any workspace - or into a new section.
 *
 * Each workspace's cards are worked out the way
 * components/bookmarks/dashboard-view.tsx does - each folder directly in the
 * workspace's folder (other workspaces' roots aside), plus "Unsorted" for the
 * bookmarks loose in it - minus the ones hidden on the dashboard, so the list
 * is exactly the cards the user sees there. A new section is the same folder
 * the dashboard's "New section" makes. Both are plain Chrome bookmark writes:
 * an open dashboard picks them up through its chrome.bookmarks listeners, and
 * gives a new card a column like any other (hooks/use-card-columns.ts).
 */

import { normalizeUrl } from "@/lib/bookmark-health"
import {
  type BookmarkNode,
  createBookmark,
  createFolder,
  getTree,
  isFolder,
} from "@/lib/bookmarks"
import { readHiddenFolders } from "@/lib/hidden-folders"
import { hasTabsApi, isInternalUrl } from "@/lib/session-bundles"
import {
  bindWorkspaceFolder,
  isSystemWorkspace,
  readWorkspaceState,
  resolveWorkspace,
  type Workspace,
} from "@/lib/workspaces"

export interface CurrentPage {
  title: string
  url: string
  favIconUrl: string
}

/** The page in the tab the popup was opened over, or null if it can't be bookmarked. */
export async function readCurrentPage(): Promise<CurrentPage | null> {
  if (!hasTabsApi()) return null
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  // The same pages a saved session leaves out: the new tab page (this
  // dashboard), other extension pages, chrome:// pages and blank tabs.
  if (!tab?.url || isInternalUrl(tab.url)) return null
  return {
    title: tab.title || tab.url,
    url: tab.url,
    favIconUrl: tab.favIconUrl ?? "",
  }
}

export interface SaveSection {
  /** The card's folder - for Unsorted, the workspace's own folder. */
  id: string
  title: string
}

export interface SaveGroup {
  workspace: Workspace
  /** The workspace's folder, where a new section goes. */
  rootId: string
  sections: SaveSection[]
}

export interface SaveTargets {
  /**
   * Every workspace whose folder resolves: Personal (the Bookmarks Bar) first,
   * then the rest in the dashboard switcher's order.
   */
  groups: SaveGroup[]
  /** The first card that already has the page, if any - saving it again is refused. */
  savedIn: { group: SaveGroup; section: SaveSection } | null
}

/**
 * Every workspace's cards, each in its folder's own order. A workspace whose
 * folder is missing or misplaced isn't offered - per lib/workspaces.ts there's
 * never a fallback to some other folder, and the dashboard explains the
 * problem and offers the fix. Null if no workspace resolves at all.
 *
 * `pageUrl` is null for a page that can't be bookmarked: the cards are still
 * listed, so the popup looks the same on every page, but nothing is looked up.
 */
export async function readSaveTargets(
  pageUrl: string | null
): Promise<SaveTargets | null> {
  const state = readWorkspaceState()
  const tree = await getTree()
  const workspaceRoots = new Set(
    state.workspaces.map((each) => bindWorkspaceFolder(tree, each).folderId)
  )
  const page = pageUrl === null ? null : normalizeUrl(pageUrl)

  // The system workspace is normally first already; sorting makes sure. The
  // sort is stable, so the rest keep their order.
  const ordered = [...state.workspaces].sort(
    (a, b) => Number(isSystemWorkspace(b)) - Number(isSystemWorkspace(a))
  )
  const groups: SaveGroup[] = []
  let savedIn: SaveTargets["savedIn"] = null
  for (const each of ordered) {
    const { status, node: root, workspace } = resolveWorkspace(tree, each)
    if (status !== "ok" || !root) continue

    const hidden = new Set(readHiddenFolders(workspace.id))
    const children = root.children ?? []
    const group: SaveGroup = { workspace, rootId: root.id, sections: [] }
    for (const folder of children) {
      if (
        !isFolder(folder) ||
        workspaceRoots.has(folder.id) ||
        hidden.has(folder.id)
      )
        continue
      const section = { id: folder.id, title: folder.title || "(untitled)" }
      group.sections.push(section)
      if (!savedIn && page !== null && holdsPage(folder, page)) {
        savedIn = { group, section }
      }
    }
    if (!hidden.has(root.id)) {
      const section = { id: root.id, title: "Unsorted" }
      group.sections.push(section)
      if (
        !savedIn &&
        page !== null &&
        children.some((node) => !isFolder(node) && holdsPage(node, page))
      ) {
        savedIn = { group, section }
      }
    }
    groups.push(group)
  }
  if (groups.length === 0) return null
  return { groups, savedIn }
}

/** Whether `node` is a bookmark for `page` (normalized), or a folder with one anywhere inside. */
function holdsPage(node: BookmarkNode, page: string): boolean {
  if (node.url !== undefined) return normalizeUrl(node.url) === page
  return (node.children ?? []).some((child) => holdsPage(child, page))
}

/**
 * The card the last save went into, which the dropdown opens on next time -
 * highlighted, one Enter or click from being chosen again. One key for every
 * workspace rather than one each: it's a folder id, unique across them, and
 * the popup's list spans them all.
 */
const LAST_SECTION_KEY = "bm:last-save-section"

export function readLastSection(): string | null {
  try {
    return window.localStorage.getItem(LAST_SECTION_KEY)
  } catch {
    return null
  }
}

function writeLastSection(sectionId: string): void {
  try {
    window.localStorage.setItem(LAST_SECTION_KEY, sectionId)
  } catch {
    // ignore write failures (storage disabled, quota exceeded)
  }
}

export type SaveDestination =
  { sectionId: string } | { newSection: string; workspaceId: string }

/**
 * Bookmarks `page` in `destination` and returns the card it went into, or null
 * if there was nowhere to put it. A new section named like one of that
 * workspace's cards (ignoring case) is that card, not a second one beside it.
 * Throws if Chrome refuses the write.
 */
export async function savePage(
  targets: SaveTargets,
  destination: SaveDestination,
  page: CurrentPage
): Promise<SaveSection | null> {
  let section: SaveSection | null
  if ("sectionId" in destination) {
    section =
      targets.groups
        .flatMap((group) => group.sections)
        .find((each) => each.id === destination.sectionId) ?? null
  } else {
    const group = targets.groups.find(
      (each) => each.workspace.id === destination.workspaceId
    )
    const title = destination.newSection.trim()
    if (!group || !title) return null
    section =
      group.sections.find(
        (each) =>
          each.id !== group.rootId &&
          each.title.toLowerCase() === title.toLowerCase()
      ) ?? null
    if (!section) {
      const folder = await createFolder({ parentId: group.rootId, title })
      if (!folder) return null
      section = { id: folder.id, title }
    }
  }
  if (!section) return null

  const bookmark = await createBookmark({
    parentId: section.id,
    title: page.title,
    url: page.url,
  })
  if (!bookmark) return null
  writeLastSection(section.id)
  return section
}
