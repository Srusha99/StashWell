/**
 * Turns a parsed Netscape-format bookmarks export into real folders and
 * bookmarks under a destination folder. Copying a *live* browser folder (the
 * "Import from browser" row) reuses lib/bookmark-copy.ts's copyFolderTree
 * instead - this is only for plain, not-yet-in-Chrome data: a parsed export
 * file, or a workspace backup being restored.
 */

import { createBookmark, createFolder } from "@/lib/bookmarks"

/** A plain (non-Chrome) node parsed from an import source or a backup file. */
export interface ImportNode {
  title: string
  url?: string
  children?: ImportNode[]
}

/** Recursively creates folders/bookmarks under `destParentId`, mirroring `nodes`. */
export async function copyImportTree(nodes: ImportNode[], destParentId: string): Promise<void> {
  for (const node of nodes) {
    if (node.url !== undefined) {
      await createBookmark({ parentId: destParentId, title: node.title, url: node.url })
      continue
    }

    const children = node.children ?? []
    if (!node.title && children.length === 0) continue

    const folder = await createFolder({ parentId: destParentId, title: node.title })
    if (folder && children.length > 0) {
      await copyImportTree(children, folder.id)
    }
  }
}

/**
 * Parses a standard Netscape-format bookmarks export (what Chrome, Toby,
 * Workona, Raindrop and Pocket all produce): nested <DL><DT> lists, folders as
 * <H3> headings, bookmarks as <A href>. Returns the top-level items only -
 * callers walk `children` themselves via copyBookmarkTree.
 */
export function parseNetscapeBookmarksHtml(html: string): ImportNode[] {
  const doc = new DOMParser().parseFromString(html, "text/html")

  // Netscape export shape: <DT><H3>Folder</H3><DL>...children...</DL>
  // and <DT><A href="...">Title</A>, all siblings inside one flat <DL>. There
  // is no nesting via the DOM parent/child relationship you'd expect - it's
  // sibling DT/DL pairs - so this walks the DL's direct children in order and
  // pairs each H3 with the DL immediately after it.
  function parseList(dl: Element): ImportNode[] {
    const nodes: ImportNode[] = []
    const items = Array.from(dl.children).filter((el) => el.tagName === "DT")

    for (const dt of items) {
      const link = dt.querySelector(":scope > A")
      if (link) {
        const url = link.getAttribute("href")
        if (url) {
          nodes.push({ title: link.textContent?.trim() || url, url })
        }
        continue
      }

      const heading = dt.querySelector(":scope > H3")
      if (!heading) continue
      const childList = dt.querySelector(":scope > DL")
      nodes.push({
        title: heading.textContent?.trim() || "Imported folder",
        children: childList ? parseList(childList) : [],
      })
    }

    return nodes
  }

  const rootList = doc.querySelector("DL")
  return rootList ? parseList(rootList) : []
}
