"use client"

import * as React from "react"

import { copyFolderTree, uniqueChildTitle } from "@/lib/bookmark-copy"
import {
  BOOKMARKS_BAR_ID,
  type BookmarkNode,
  findNode,
  getTree,
  isFolder,
  moveNode,
  removeNode,
  subscribeToChanges,
  updateBookmark,
} from "@/lib/bookmarks"
import { unhideFolderIn } from "@/lib/hidden-folders"
import {
  DEFAULT_EMOJI,
  DEFAULT_WORKSPACE_ID,
  type ResolvedWorkspace,
  type Workspace,
  type WorkspaceState,
  adoptOrphanedFolders,
  clearWorkspaceData,
  createWorkspaceFolder,
  ensureWorkspacesContainer,
  newWorkspaceId,
  readWorkspaceState,
  resolveWorkspace,
  runWorkspaceMigrations,
  writeWorkspaceState,
} from "@/lib/workspaces"

interface WorkspaceContextValue {
  workspaces: Workspace[]
  activeWorkspace: Workspace
  activeId: string
  /** Folder-resolution result for the active workspace. */
  resolved: ResolvedWorkspace
  /** Every workspace's folder id, for excluding them from folder listings. */
  workspaceFolderIds: Set<string>
  /** Workspaces a folder can be moved into: not the active one, folder resolves. */
  moveTargets: Workspace[]
  /** False until the client has read persisted state, to avoid a hydration mismatch. */
  isReady: boolean
  isBusy: boolean
  switchTo: (id: string) => void
  createWorkspace: (input: { name: string; emoji: string }) => Promise<Workspace | null>
  updateWorkspace: (id: string, patch: { name?: string; emoji?: string }) => Promise<void>
  deleteWorkspace: (id: string, options: { deleteBookmarks: boolean }) => Promise<void>
  /** Moves a bookmark folder out of the active workspace and into another. */
  moveFolderToWorkspace: (folderId: string, targetWorkspaceId: string) => Promise<boolean>
  /** Deep-copies a bookmark folder into another workspace, leaving the original. */
  copyFolderToWorkspace: (folderId: string, targetWorkspaceId: string) => Promise<boolean>
  /** Re-creates a workspace's folder after it was deleted in Chrome. */
  repairWorkspace: (id: string) => Promise<void>
  /** Moves a folder that drifted out of the container back into it. */
  relocateWorkspace: (id: string) => Promise<void>
}

const WorkspaceContext = React.createContext<WorkspaceContextValue | null>(null)

export function useWorkspaces(): WorkspaceContextValue {
  const context = React.useContext(WorkspaceContext)
  if (!context) {
    throw new Error("useWorkspaces must be used inside a <WorkspaceProvider>")
  }
  return context
}

export function WorkspaceProvider({
  children,
  onWorkspaceChange,
}: {
  children: React.ReactNode
  /** Fired on a switch, so the shell can drop state scoped to the old workspace. */
  onWorkspaceChange?: (id: string) => void
}) {
  // Migrations run here, synchronously, inside the lazy initializer: they must
  // happen before any per-workspace hook reads its namespaced key, which rules
  // out an effect, and they touch `window`, which rules out module scope (this
  // module still executes in Node during the static-export prerender).
  const [state, setState] = React.useState<WorkspaceState>(() =>
    runWorkspaceMigrations(readWorkspaceState())
  )
  const [tree, setTree] = React.useState<BookmarkNode[]>([])
  const [isReady, setIsReady] = React.useState(false)
  const [isBusy, setIsBusy] = React.useState(false)

  // The provider keeps its own light view of the tree so it can notice a
  // workspace's folder being deleted or moved in Chrome's own bookmark manager.
  React.useEffect(() => {
    let active = true

    async function load() {
      const nextTree = await getTree()
      if (!active) return
      setTree(nextTree)
      // Adopt container folders no record points at - this is what makes the
      // feature work on a second synced device, where the folders arrived but
      // localStorage did not.
      setState((current) => {
        const adopted = adoptOrphanedFolders(nextTree, current)
        if (adopted !== current) writeWorkspaceState(adopted)
        return adopted
      })
      // Flipped here, after the await, rather than in a bare mount effect: the
      // prerendered markup can't know which workspace is active, so consumers
      // render a neutral label until the client has read persisted state.
      setIsReady(true)
    }

    load()
    const unsubscribe = subscribeToChanges(load)

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const commit = React.useCallback((next: WorkspaceState) => {
    writeWorkspaceState(next)
    setState(next)
  }, [])

  const activeWorkspace =
    state.workspaces.find((workspace) => workspace.id === state.activeId) ?? state.workspaces[0]

  const switchTo = React.useCallback(
    (id: string) => {
      setState((current) => {
        if (current.activeId === id) return current
        if (!current.workspaces.some((workspace) => workspace.id === id)) return current
        const next = { ...current, activeId: id }
        writeWorkspaceState(next)
        return next
      })
      onWorkspaceChange?.(id)
    },
    [onWorkspaceChange]
  )

  const createWorkspace = React.useCallback(
    async ({ name, emoji }: { name: string; emoji: string }) => {
      const trimmed = name.trim()
      if (!trimmed) return null

      setIsBusy(true)
      try {
        const folderId = await createWorkspaceFolder(trimmed)
        // Refuse to persist a workspace with no real folder behind it. A record
        // with an empty folderId would be a poison pill that survives
        // localStorage from `next dev` into the packaged extension.
        if (!folderId) return null

        const workspace: Workspace = {
          id: newWorkspaceId(),
          name: trimmed,
          emoji: emoji || DEFAULT_EMOJI,
          folderId,
          createdAt: Date.now(),
        }

        commit({
          ...state,
          workspaces: [...state.workspaces, workspace],
          activeId: workspace.id,
        })
        onWorkspaceChange?.(workspace.id)
        setTree(await getTree())
        return workspace
      } finally {
        setIsBusy(false)
      }
    },
    [commit, onWorkspaceChange, state]
  )

  const updateWorkspace = React.useCallback(
    async (id: string, patch: { name?: string; emoji?: string }) => {
      const target = state.workspaces.find((workspace) => workspace.id === id)
      if (!target) return

      const name = patch.name?.trim()
      if (patch.name !== undefined && !name) return

      commit({
        ...state,
        workspaces: state.workspaces.map((workspace) =>
          workspace.id === id
            ? { ...workspace, ...(name ? { name } : {}), ...(patch.emoji ? { emoji: patch.emoji } : {}) }
            : workspace
        ),
      })

      // Keep the Chrome folder's title in step, or it drifts from the workspace
      // name and adoption on another device picks up the stale one. The
      // Bookmarks Bar is a root folder - chrome.bookmarks.update throws on it.
      if (name && target.folderId !== BOOKMARKS_BAR_ID) {
        await updateBookmark(target.folderId, { title: name })
        setTree(await getTree())
      }
    },
    [commit, state]
  )

  const deleteWorkspace = React.useCallback(
    async (id: string, { deleteBookmarks }: { deleteBookmarks: boolean }) => {
      // The Bookmarks-Bar-backed workspace is permanent: removeTree("1") would
      // target a root folder, and there must always be somewhere to land.
      if (id === DEFAULT_WORKSPACE_ID) return
      const target = state.workspaces.find((workspace) => workspace.id === id)
      if (!target || state.workspaces.length <= 1) return

      setIsBusy(true)
      try {
        if (deleteBookmarks && target.folderId !== BOOKMARKS_BAR_ID) {
          await removeNode(target.folderId, true)
        }

        // Notes, reminders, hidden folders and card layout always go.
        clearWorkspaceData(id)

        const workspaces = state.workspaces.filter((workspace) => workspace.id !== id)
        const activeId = state.activeId === id ? DEFAULT_WORKSPACE_ID : state.activeId
        commit({ ...state, workspaces, activeId })
        if (state.activeId === id) onWorkspaceChange?.(activeId)
        setTree(await getTree())
      } finally {
        setIsBusy(false)
      }
    },
    [commit, onWorkspaceChange, state]
  )

  /**
   * Cross-workspace folder move. Because each workspace is a real Chrome folder,
   * this is just a bookmarks move - the folder keeps its id, so its per-folder
   * view mode and any custom icons inside it follow it across.
   */
  /**
   * Shared preconditions for moving and copying a folder across workspaces.
   * Returns the destination workspace and its resolved folder node, or null when
   * the transfer must not happen.
   */
  const resolveTransfer = React.useCallback(
    (folderId: string, targetWorkspaceId: string) => {
      if (!folderId) return null
      const target = state.workspaces.find((workspace) => workspace.id === targetWorkspaceId)
      if (!target || target.id === activeWorkspace.id) return null

      // A workspace's own root folder is not transferable - nesting one workspace
      // inside another would make both show the same bookmarks.
      if (state.workspaces.some((workspace) => workspace.folderId === folderId)) return null

      // Refuse rather than put a folder somewhere it wouldn't be shown.
      const destination = resolveWorkspace(tree, target)
      if (destination.status !== "ok" || !destination.node) return null

      return { target, destinationNode: destination.node }
    },
    [state.workspaces, activeWorkspace.id, tree]
  )

  const moveFolderToWorkspace = React.useCallback(
    async (folderId: string, targetWorkspaceId: string) => {
      const transfer = resolveTransfer(folderId, targetWorkspaceId)
      if (!transfer) return false
      const { target } = transfer

      setIsBusy(true)
      try {
        const moved = await moveNode(folderId, { parentId: target.folderId })
        if (!moved) return false
        // Folder ids survive a move, so a hidden entry left over from an earlier
        // stint in the destination would make the folder arrive invisible.
        unhideFolderIn(target.id, folderId)
        setTree(await getTree())
        return true
      } finally {
        setIsBusy(false)
      }
    },
    [resolveTransfer]
  )

  /**
   * Cross-workspace folder copy. Unlike a move this can't be a bookmarks move -
   * chrome.bookmarks has no copy - so the subtree is re-created node by node.
   * Custom icons are keyed by URL rather than bookmark id, so the copy picks the
   * originals' icons up for free.
   */
  const copyFolderToWorkspace = React.useCallback(
    async (folderId: string, targetWorkspaceId: string) => {
      const transfer = resolveTransfer(folderId, targetWorkspaceId)
      if (!transfer) return false
      const { target, destinationNode } = transfer

      const source = findNode(tree, folderId)
      if (!source || !isFolder(source)) return false

      setIsBusy(true)
      try {
        const created = await copyFolderTree(
          source,
          target.folderId,
          uniqueChildTitle(destinationNode, source.title)
        )
        if (!created) return false
        setTree(await getTree())
        return true
      } finally {
        setIsBusy(false)
      }
    },
    [resolveTransfer, tree]
  )

  const repairWorkspace = React.useCallback(
    async (id: string) => {
      const target = state.workspaces.find((workspace) => workspace.id === id)
      if (!target) return

      setIsBusy(true)
      try {
        const folderId = await createWorkspaceFolder(target.name)
        if (!folderId) return
        commit({
          ...state,
          workspaces: state.workspaces.map((workspace) =>
            workspace.id === id ? { ...workspace, folderId } : workspace
          ),
        })
        setTree(await getTree())
      } finally {
        setIsBusy(false)
      }
    },
    [commit, state]
  )

  const relocateWorkspace = React.useCallback(
    async (id: string) => {
      const target = state.workspaces.find((workspace) => workspace.id === id)
      if (!target) return

      setIsBusy(true)
      try {
        const containerId = await ensureWorkspacesContainer()
        if (!containerId) return
        await moveNode(target.folderId, { parentId: containerId })
        setTree(await getTree())
      } finally {
        setIsBusy(false)
      }
    },
    [state]
  )

  const resolved = React.useMemo(
    () => resolveWorkspace(tree, activeWorkspace),
    [tree, activeWorkspace]
  )

  const workspaceFolderIds = React.useMemo(
    () => new Set(state.workspaces.map((workspace) => workspace.folderId)),
    [state.workspaces]
  )

  // Only workspaces whose own folder currently resolves, so the move menu can't
  // offer a destination the folder would vanish into. Empty without the bookmarks
  // API, which correctly hides the move option outside the extension.
  const moveTargets = React.useMemo(
    () =>
      state.workspaces.filter(
        (workspace) =>
          workspace.id !== activeWorkspace.id &&
          resolveWorkspace(tree, workspace).status === "ok"
      ),
    [state.workspaces, activeWorkspace.id, tree]
  )

  const value = React.useMemo<WorkspaceContextValue>(
    () => ({
      workspaces: state.workspaces,
      activeWorkspace,
      activeId: activeWorkspace.id,
      resolved,
      workspaceFolderIds,
      moveTargets,
      isReady,
      isBusy,
      switchTo,
      createWorkspace,
      updateWorkspace,
      deleteWorkspace,
      moveFolderToWorkspace,
      copyFolderToWorkspace,
      repairWorkspace,
      relocateWorkspace,
    }),
    [
      state.workspaces,
      activeWorkspace,
      resolved,
      workspaceFolderIds,
      moveTargets,
      isReady,
      isBusy,
      switchTo,
      createWorkspace,
      updateWorkspace,
      deleteWorkspace,
      moveFolderToWorkspace,
      copyFolderToWorkspace,
      repairWorkspace,
      relocateWorkspace,
    ]
  )

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}
