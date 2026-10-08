"use client"

import * as React from "react"
import { ChevronRightIcon, GlobeIcon, PencilIcon, PlayIcon, Trash2Icon, XIcon } from "lucide-react"

import {
  ShareTabsButton,
  TabSelectionHeader,
  shareCheckboxClass,
} from "@/components/session-bundles/tab-share-controls"
import { CARD, MUTED, PILL, PILL_HIGHLIGHT, ROW, TEXT } from "@/components/session-bundles/tones"
import { type SessionBundle } from "@/lib/session-bundles"
import { cn } from "@/lib/utils"

/** "Oct 6", or with `withTime` "Oct 6, 12:51 AM" - the auto-generated bundle name's format. */
function formatDate(iso: string, withTime: boolean): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  })
}

/** "Project Alpha" -> "PA", "Research" -> "RE". */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "?"
  const letters =
    words.length === 1
      ? Array.from(words[0]).slice(0, 2)
      : [Array.from(words[0])[0], Array.from(words[1])[0]]
  return letters.join("").toUpperCase()
}

const AVATAR_COLORS = [
  "from-[#eff6ff] to-[#dbeafe] text-[#3b82f6] border-[#bfdbfe]",
  "from-[#ecfdf5] to-[#d1fae5] text-[#10b981] border-[#a7f3d0]",
  "from-[#f5f3ff] to-[#ede9fe] text-[#8b5cf6] border-[#ddd6fe]",
]
const AVATAR_HIGHLIGHT = "from-[#ffedd5] to-[#fed7aa] text-[#c2410c] border-[#fdba74]"

/** The same color for a bundle every time, picked from its id. */
function avatarColor(id: string): string {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

/** Small round icon button. */
function IconButton({ className, ...props }: React.ComponentPropsWithoutRef<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "flex size-[30px] shrink-0 items-center justify-center rounded-full transition hover:scale-[1.08] disabled:pointer-events-none disabled:opacity-40",
        className
      )}
      {...props}
    />
  )
}

export function Favicon({ url }: { url: string }) {
  const [failed, setFailed] = React.useState(false)
  if (!url || failed) {
    return (
      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-[#f1f5f9]">
        <GlobeIcon className="size-2.5 text-[#94a3b8]" />
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      className="size-4 shrink-0 rounded-full bg-[#f1f5f9] object-contain"
      onError={() => setFailed(true)}
    />
  )
}

/**
 * One saved bundle as a pill: its initials, name and size, and restore /
 * delete. In the main list (`expandable`) it's a rounded card led by a
 * chevron instead, and clicking it opens the bundle's tabs below - to open,
 * remove, or share some of them - and renaming lives there too.
 */
export function BundlePill({
  bundle,
  onRestore,
  onDelete,
  onRename,
  onDeleteTab,
  expandable = false,
  withTime = false,
  highlight = false,
}: {
  bundle: SessionBundle
  onRestore: (bundle: SessionBundle) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onRename?: (id: string, name: string) => Promise<void>
  onDeleteTab?: (bundleId: string, tabId: string) => Promise<void>
  expandable?: boolean
  /** Show the time saved as well as the day. */
  withTime?: boolean
  /** Tint it as one of the bundles the free plan's limit is counting. */
  highlight?: boolean
}) {
  const [expanded, setExpanded] = React.useState(false)
  const [editing, setEditing] = React.useState(false)
  const [nameDraft, setNameDraft] = React.useState(bundle.name)
  const [confirmingDelete, setConfirmingDelete] = React.useState(false)
  const [isDeleting, setIsDeleting] = React.useState(false)
  const [isRestoring, setIsRestoring] = React.useState(false)
  // Every tab starts checked, same as the Quick Share panel, so Share works
  // on the whole bundle without any ticking first.
  const [selectedTabIds, setSelectedTabIds] = React.useState<Set<string>>(
    () => new Set(bundle.tabs.map((tab) => tab.id))
  )

  // Filtering over bundle.tabs (rather than mapping selectedTabIds directly)
  // means a tab removed via onDeleteTab drops out of the selection for free,
  // even though its id can linger harmlessly in the Set.
  const selectedTabs = bundle.tabs.filter((tab) => selectedTabIds.has(tab.id))

  function toggleTabSelection(tabId: string) {
    setSelectedTabIds((current) => {
      const next = new Set(current)
      if (next.has(tabId)) next.delete(tabId)
      else next.add(tabId)
      return next
    })
  }

  async function handleDeleteConfirmed() {
    setIsDeleting(true)
    await onDelete(bundle.id)
  }

  async function commitRename() {
    setEditing(false)
    if (onRename && nameDraft.trim() && nameDraft.trim() !== bundle.name) {
      await onRename(bundle.id, nameDraft)
    } else {
      setNameDraft(bundle.name)
    }
  }

  async function handleRestore() {
    setIsRestoring(true)
    try {
      await onRestore(bundle)
    } finally {
      setIsRestoring(false)
    }
  }

  const avatar = expandable ? (
    <span
      className={cn(
        "flex size-[30px] shrink-0 items-center justify-center rounded-full bg-[#f1f5f9] text-[#475569] transition",
        expanded && "bg-[#e2e8f0]"
      )}
      aria-hidden
    >
      <ChevronRightIcon className={cn("size-4 transition-transform", expanded && "rotate-90")} />
    </span>
  ) : (
    <span
      className={cn(
        "flex size-[34px] shrink-0 items-center justify-center rounded-full border bg-gradient-to-br text-[0.7rem] font-bold",
        highlight ? AVATAR_HIGHLIGHT : avatarColor(bundle.id)
      )}
      aria-hidden
    >
      {initialsOf(bundle.name)}
    </span>
  )
  const meta = (
    <span className={cn("whitespace-nowrap", expandable ? "text-[0.7rem]" : "text-[0.6rem]", MUTED)}>
      {bundle.tabCount} tab{bundle.tabCount === 1 ? "" : "s"} · {formatDate(bundle.createdAt, withTime)}
    </span>
  )

  return (
    <div className={TEXT}>
      <div
        className={cn(
          highlight ? PILL_HIGHLIGHT : expandable ? ROW : PILL,
          "flex items-center justify-between gap-2",
          expandable ? "p-3" : "py-2 pr-2.5 pl-2"
        )}
      >
        {confirmingDelete ? (
          <div className="flex min-w-0 flex-1 items-center justify-between gap-2 pl-2">
            <p className="min-w-0 truncate text-xs text-[#b91c1c]">Delete &ldquo;{bundle.name}&rdquo;?</p>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={isDeleting}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[0.7rem] font-medium transition hover:bg-[#f1f5f9] disabled:opacity-40",
                  MUTED
                )}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirmed}
                disabled={isDeleting}
                className="rounded-full bg-[#ef4444] px-3 py-1 text-[0.7rem] font-semibold text-white transition hover:bg-[#dc2626] disabled:opacity-60"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        ) : (
          <>
            {editing ? (
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                {avatar}
                <input
                  autoFocus
                  value={nameDraft}
                  aria-label="Bundle name"
                  onChange={(event) => setNameDraft(event.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") commitRename()
                    if (event.key === "Escape") {
                      setNameDraft(bundle.name)
                      setEditing(false)
                    }
                  }}
                  className="h-7 min-w-0 flex-1 rounded-full border border-[#e2e8f0] bg-white px-2.5 text-[0.75rem] font-semibold outline-none focus:border-[#3b82f6] focus:ring-2 focus:ring-[#3b82f6]/15"
                />
              </div>
            ) : expandable ? (
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                aria-expanded={expanded}
                title={expanded ? "Hide tabs" : "Show tabs"}
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
              >
                {avatar}
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-[0.85rem] font-semibold">{bundle.name}</span>
                  {meta}
                </span>
              </button>
            ) : (
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                {avatar}
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[0.75rem] font-semibold">{bundle.name}</span>
                  {meta}
                </span>
              </div>
            )}

            {expandable ? (
              <div className="flex shrink-0 gap-2">
                <IconButton
                  onClick={handleRestore}
                  disabled={isRestoring || bundle.tabs.length === 0}
                  aria-label="Restore bundle in a new window"
                  className="size-8 bg-[#1a73e8] text-white shadow-[0_2px_6px_rgba(26,115,232,0.3)] hover:bg-[#1765cc]"
                >
                  <PlayIcon className="size-[15px] translate-x-px" />
                </IconButton>
                <IconButton
                  onClick={() => setConfirmingDelete(true)}
                  aria-label="Delete bundle"
                  className="size-8 border border-[#e2e8f0] bg-[#f1f5f9] text-[#334155] hover:border-[#fecaca] hover:bg-[#fee2e2] hover:text-[#ef4444]"
                >
                  <Trash2Icon className="size-[15px]" />
                </IconButton>
              </div>
            ) : (
              <div className="flex shrink-0 gap-[5px]">
                <IconButton
                  onClick={handleRestore}
                  disabled={isRestoring || bundle.tabs.length === 0}
                  aria-label="Restore bundle in a new window"
                  className="bg-[#eff6ff] text-[#3b82f6] hover:bg-[#3b82f6] hover:text-white hover:shadow-[0_4px_10px_rgba(59,130,246,0.3)]"
                >
                  <PlayIcon className="size-[13px] fill-current" />
                </IconButton>
                <IconButton
                  onClick={() => setConfirmingDelete(true)}
                  aria-label="Delete bundle"
                  className="bg-[#f8fafc] text-[#94a3b8] hover:bg-[#fee2e2] hover:text-[#ef4444]"
                >
                  <Trash2Icon className="size-[13px]" />
                </IconButton>
              </div>
            )}
          </>
        )}
      </div>

      {expandable && expanded && (
        <div className={cn(CARD, "mt-1.5 space-y-2 p-3")}>
          {onRename && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className={cn("flex items-center gap-1 text-[0.7rem] font-medium hover:text-[#0f172a]", MUTED)}
            >
              <PencilIcon className="size-3" /> Rename bundle
            </button>
          )}

          {bundle.tabs.length === 0 && <p className={cn("text-xs", MUTED)}>No tabs left in this bundle.</p>}

          {bundle.tabs.length > 0 && (
            <TabSelectionHeader
              selectedCount={selectedTabs.length}
              totalCount={bundle.tabs.length}
              onSelectAll={() => setSelectedTabIds(new Set(bundle.tabs.map((tab) => tab.id)))}
              onDeselectAll={() => setSelectedTabIds(new Set())}
              className="border-t border-[#e2e8f0] pt-2"
            />
          )}

          {bundle.tabs.map((tab) => (
            <div key={tab.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selectedTabIds.has(tab.id)}
                onChange={() => toggleTabSelection(tab.id)}
                aria-label={`Select ${tab.title}`}
                className={shareCheckboxClass("save")}
              />
              <Favicon url={tab.favIconUrl} />
              <button
                type="button"
                onClick={() => chrome.tabs.create({ url: tab.url })}
                title={tab.url}
                aria-label={`Open ${tab.title || tab.url}`}
                className="min-w-0 flex-1 truncate text-left text-xs font-medium hover:underline"
              >
                {tab.title || tab.url}
              </button>
              {onDeleteTab && (
                <IconButton
                  className="size-5 bg-[#f8fafc] text-[#94a3b8] hover:scale-100 hover:bg-[#fee2e2] hover:text-[#ef4444]"
                  onClick={() => onDeleteTab(bundle.id, tab.id)}
                  aria-label="Remove this tab from the bundle"
                >
                  <XIcon className="size-3" />
                </IconButton>
              )}
            </div>
          ))}

          {bundle.tabs.length > 0 && <ShareTabsButton tabs={selectedTabs} tone="save" />}
        </div>
      )}
    </div>
  )
}
