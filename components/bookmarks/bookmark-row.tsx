"use client"

import * as React from "react"
import { Copy, ExternalLink, Folder, Pencil, Trash2 } from "lucide-react"

import { type BookmarkNode, isFolder } from "@/hooks/use-bookmarks"
import { useCustomIcon } from "@/hooks/use-custom-icon"
import { FaviconImg } from "@/components/bookmarks/favicon-image"
import { Button } from "@/components/ui/button"

/** Bare host for the row's subtitle, e.g. "mail.google.com". */
function hostOf(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return null
  }
}

export function BookmarkRow({
  node,
  onEdit,
  onDelete,
  onDrillInto,
}: {
  node: BookmarkNode
  onEdit: (node: BookmarkNode) => void
  onDelete: (node: BookmarkNode) => void
  onDrillInto: (folderId: string) => void
}) {
  const [copied, setCopied] = React.useState(false)
  const [customIcon] = useCustomIcon(node.url ?? null)

  if (isFolder(node)) {
    return (
      <button
        type="button"
        onClick={() => onDrillInto(node.id)}
        className="flex w-full items-center gap-2 py-1 text-left"
      >
        <Folder className="size-4 shrink-0 text-[#8e8e93] dark:text-white/50" />
        <span className="truncate text-xs text-[#1c1c1e] dark:text-white/85">
          {node.title || "(untitled)"}
        </span>
      </button>
    )
  }

  const fallbackIcon = <Folder className="size-4 shrink-0 text-[#8e8e93] dark:text-white/50" />
  // Shown under the title, as in the design. Bare host, without the www. noise.
  const host = hostOf(node.url)

  async function handleCopy(event: React.MouseEvent) {
    event.preventDefault()
    if (!node.url) return
    try {
      await navigator.clipboard.writeText(node.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      // clipboard unavailable, ignore
    }
  }

  return (
    <div className="group/row relative flex items-center gap-2 py-1">
      <a href={node.url} className="flex min-w-0 flex-1 items-center gap-2">
        {customIcon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={customIcon} alt="" className="size-4 shrink-0 rounded-[3px]" />
        ) : node.url ? (
          <FaviconImg
            url={node.url}
            className="size-4 shrink-0 rounded-[3px]"
            fallback={fallbackIcon}
          />
        ) : (
          fallbackIcon
        )}
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-xs text-[#1c1c1e] dark:text-white/85">
            {node.title || host || node.url}
          </span>
          {host && (
            <span className="truncate text-[10px] text-[#8e8e93] dark:text-white/35">{host}</span>
          )}
        </span>
      </a>

      <div className="absolute inset-y-0 right-0 flex items-center gap-0.5 rounded-md bg-white/85 px-1 opacity-0 backdrop-blur-sm group-hover/row:opacity-100 dark:bg-black/50">
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-[#8e8e93] hover:bg-black/[0.04] hover:text-[#1c1c1e] dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
          onClick={(event: React.MouseEvent) => {
            event.preventDefault()
            onEdit(node)
          }}
          aria-label="Edit"
        >
          <Pencil />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-[#8e8e93] hover:bg-black/[0.04] hover:text-[#1c1c1e] dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
          onClick={handleCopy}
          aria-label="Copy URL"
        >
          <Copy />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-[#8e8e93] hover:bg-black/[0.04] hover:text-[#1c1c1e] dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
          render={<a href={node.url} target="_blank" rel="noreferrer" />}
          aria-label="Open in new tab"
        >
          <ExternalLink />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-[#8e8e93] hover:bg-destructive/10 hover:text-destructive dark:text-white/70 dark:hover:bg-destructive/20"
          onClick={(event: React.MouseEvent) => {
            event.preventDefault()
            onDelete(node)
          }}
          aria-label="Delete"
        >
          <Trash2 />
        </Button>
        {copied && (
          <span className="absolute -top-5 right-0 text-[10px] text-[#8e8e93] dark:text-white/60">Copied!</span>
        )}
      </div>
    </div>
  )
}
