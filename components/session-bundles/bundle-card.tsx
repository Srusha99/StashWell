"use client"

import * as React from "react"
import {
  ChevronDownIcon,
  ChevronRightIcon,
  GlobeIcon,
  PlayIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"

import {
  ShareTabsButton,
  TabSelectionHeader,
  shareCheckboxClass,
} from "@/components/session-bundles/tab-share-controls"
import { TONES } from "@/components/session-bundles/tones"
import { type SessionBundle } from "@/lib/session-bundles"
import { cn } from "@/lib/utils"

/** Same format as the auto-generated bundle name (defaultBundleName), for consistency. */
function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

/** The raised-glass shadow shared by every card in the popup. */
export const GLASS_CARD_STYLE: React.CSSProperties = {
  boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.7), 0 8px 24px -10px rgba(0,0,0,0.12)",
}

/** Small circular glass button - the shared action-icon style for this card. */
function IconButton({ className, ...props }: React.ComponentPropsWithoutRef<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full border border-black/5 bg-black/5 text-neutral-600 backdrop-blur-md transition hover:bg-black/10 hover:text-neutral-900 disabled:pointer-events-none disabled:opacity-40",
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
      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-black/5">
        <GlobeIcon className="size-2.5 text-neutral-400" />
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      className="size-4 shrink-0 rounded-full bg-black/5 object-contain"
      onError={() => setFailed(true)}
    />
  )
}

export function BundleCard({
  bundle,
  onRestore,
  onRename,
  onDelete,
  onDeleteTab,
}: {
  bundle: SessionBundle
  onRestore: (bundle: SessionBundle) => Promise<void>
  onRename: (id: string, name: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onDeleteTab: (bundleId: string, tabId: string) => Promise<void>
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

  function selectAllTabs() {
    setSelectedTabIds(new Set(bundle.tabs.map((tab) => tab.id)))
  }

  function deselectAllTabs() {
    setSelectedTabIds(new Set())
  }

  async function handleDeleteConfirmed() {
    setIsDeleting(true)
    await onDelete(bundle.id)
  }

  async function commitRename() {
    setEditing(false)
    if (nameDraft.trim() && nameDraft.trim() !== bundle.name) {
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

  return (
    <div
      className="rounded-2xl border border-black/5 bg-white/70 p-2 text-neutral-900 backdrop-blur-xl transition hover:bg-white/85"
      style={GLASS_CARD_STYLE}
    >
      <div className="flex items-center gap-1.5">
        <IconButton
          onClick={() => setExpanded((value) => !value)}
          aria-label={expanded ? "Collapse bundle" : "Expand bundle"}
        >
          {expanded ? <ChevronDownIcon className="size-3" /> : <ChevronRightIcon className="size-3" />}
        </IconButton>

        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              onBlur={commitRename}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitRename()
                if (event.key === "Escape") {
                  setNameDraft(bundle.name)
                  setEditing(false)
                }
              }}
              className="h-5 w-full min-w-0 rounded-md border border-black/10 bg-white/80 px-1.5 text-xs text-neutral-900 outline-none backdrop-blur-md focus:border-blue-400"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="block max-w-full truncate text-left text-xs font-semibold hover:underline"
              title="Click to rename"
            >
              {bundle.name}
            </button>
          )}
          <p className="text-[10px] text-neutral-500">
            {bundle.tabCount} tab{bundle.tabCount === 1 ? "" : "s"} · {formatDateTime(bundle.createdAt)}
          </p>
        </div>

        <IconButton
          onClick={handleRestore}
          disabled={isRestoring || bundle.tabs.length === 0}
          aria-label="Restore bundle in a new window"
          className={cn(TONES.save.button, "text-white hover:text-white")}
        >
          <PlayIcon className="size-3" />
        </IconButton>

        <IconButton
          onClick={() => setConfirmingDelete(true)}
          aria-label="Delete bundle"
        >
          <Trash2Icon className="size-3" />
        </IconButton>
      </div>

      {confirmingDelete && (
        <div className="mt-1.5 flex items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-2.5 py-1.5">
          <p className="text-[11px] text-red-700">Delete &ldquo;{bundle.name}&rdquo;?</p>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={isDeleting}
              className="rounded-full px-2 py-0.5 text-[11px] font-medium text-neutral-600 transition hover:bg-black/5 disabled:pointer-events-none disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDeleteConfirmed}
              disabled={isDeleting}
              className="rounded-full bg-red-500 px-2.5 py-0.5 text-[11px] font-medium text-white transition hover:bg-red-600 disabled:pointer-events-none disabled:opacity-60"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      )}

      {expanded && (
        <div className="mt-1.5 space-y-2 border-t border-black/10 pt-1.5">
          {bundle.tabs.length === 0 && (
            <p className="text-[11px] text-neutral-500">No tabs left in this bundle.</p>
          )}

          {bundle.tabs.length > 0 && (
            <TabSelectionHeader
              selectedCount={selectedTabs.length}
              totalCount={bundle.tabs.length}
              onSelectAll={selectAllTabs}
              onDeselectAll={deselectAllTabs}
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
                className="min-w-0 flex-1 truncate text-left text-[11px] font-medium hover:underline"
              >
                {tab.title || tab.url}
              </button>
              <IconButton
                className="size-5"
                onClick={() => onDeleteTab(bundle.id, tab.id)}
                aria-label="Remove this tab from the bundle"
              >
                <XIcon className="size-2.5" />
              </IconButton>
            </div>
          ))}

          {bundle.tabs.length > 0 && <ShareTabsButton tabs={selectedTabs} tone="save" />}
        </div>
      )}
    </div>
  )
}
