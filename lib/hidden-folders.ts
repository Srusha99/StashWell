import { readWorkspaceJson, writeWorkspaceJson } from "@/lib/workspace-storage"

const STORAGE_NAME = "hidden-folders"

export function readHiddenFolders(workspaceId: string): string[] {
  return readWorkspaceJson<string[]>(workspaceId, STORAGE_NAME, [], (parsed) =>
    Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : null
  )
}

export function writeHiddenFolders(workspaceId: string, ids: string[]): void {
  writeWorkspaceJson(workspaceId, STORAGE_NAME, ids)
}

/**
 * Makes sure a folder is not on a workspace's hidden list.
 *
 * Called when moving a folder INTO a workspace: folder ids are stable across a
 * move, so a folder that was hidden during an earlier stint in that workspace
 * would otherwise arrive already hidden and the move would look like it silently
 * did nothing.
 */
export function unhideFolderIn(workspaceId: string, folderId: string): void {
  const current = readHiddenFolders(workspaceId)
  if (!current.includes(folderId)) return
  writeHiddenFolders(
    workspaceId,
    current.filter((id) => id !== folderId)
  )
}
