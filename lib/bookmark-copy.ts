import {
  type BookmarkNode,
  createBookmark,
  createFolder,
  isFolder,
} from "@/lib/bookmarks"

/**
 * A folder title that doesn't collide with the folders already in `parent`,
 * suffixing "(copy)" / "(copy 2)" as needed.
 *
 * Copying the same folder into a workspace twice would otherwise leave two
 * identically-named cards side by side with no way to tell them apart.
 */
export function uniqueChildTitle(parent: BookmarkNode, title: string): string {
  const taken = new Set(
    (parent.children ?? []).filter(isFolder).map((node) => node.title)
  )
  if (!taken.has(title)) return title

  let candidate = `${title} (copy)`
  for (let n = 2; taken.has(candidate); n++) {
    candidate = `${title} (copy ${n})`
  }
  return candidate
}

/**
 * Deep-copies a bookmark folder under `parentId`, returning the new folder's id.
 *
 * chrome.bookmarks has no copy primitive, so this re-creates the subtree node by
 * node. Creates are awaited SEQUENTIALLY on purpose: create() appends to the end
 * of the parent, so awaiting each child in turn is what preserves the original
 * order - firing them in parallel would scramble it.
 *
 * Best-effort: a failure partway through leaves a partial copy rather than
 * rolling back, which is visible in the UI and can simply be deleted. In
 * practice create() only fails when the bookmarks API is absent, which callers
 * check before getting here.
 */
export async function copyFolderTree(
  source: BookmarkNode,
  parentId: string,
  titleOverride?: string
): Promise<string | null> {
  const folder = await createFolder({
    parentId,
    title: titleOverride ?? source.title,
  })
  if (!folder) return null

  for (const child of source.children ?? []) {
    if (isFolder(child)) {
      await copyFolderTree(child, folder.id)
    } else if (child.url) {
      await createBookmark({ parentId: folder.id, title: child.title, url: child.url })
    }
  }

  return folder.id
}

/** Total nodes in a subtree, for the confirmation copy in the UI. */
export function countNodes(node: BookmarkNode): number {
  return (node.children ?? []).reduce((total, child) => total + countNodes(child), 0) + 1
}
