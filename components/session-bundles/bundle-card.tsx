"use client"

import * as React from "react"
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  GlobeIcon,
  PlayIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"

import {
  copyFormattedLinks,
  type SessionBundle,
  type SessionTab,
} from "@/lib/session-bundles"
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

function Favicon({ url }: { url: string }) {
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
  const [selectedTabIds, setSelectedTabIds] = React.useState<Set<string>>(new Set())
  const [shareStatus, setShareStatus] = React.useState<string | null>(null)

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

  function flashShareStatus(message: string) {
    setShareStatus(message)
    setTimeout(() => setShareStatus(null), 1500)
  }

  async function handleShareFormattedLinks(tabs: SessionTab[]) {
    const ok = await copyFormattedLinks(tabs)
    if (ok) flashShareStatus(`Copied ${tabs.length} link${tabs.length === 1 ? "" : "s"}`)
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
      style={{
        boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.7), 0 8px 24px -10px rgba(0,0,0,0.12)",
      }}
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
          className="bg-blue-500 text-white hover:bg-blue-600 hover:text-white"
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
        <div className="mt-1.5 space-y-1 border-t border-black/10 pt-1.5 pl-7">
          {bundle.tabs.length === 0 && (
            <p className="text-[11px] text-neutral-500">No tabs left in this bundle.</p>
          )}

          {bundle.tabs.length > 0 && (
            <div className="flex items-center justify-between gap-1.5 pb-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectAllTabs}
                  className="text-[10px] font-medium text-neutral-500 transition hover:text-neutral-900 hover:underline"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={deselectAllTabs}
                  className="text-[10px] font-medium text-neutral-500 transition hover:text-neutral-900 hover:underline"
                >
                  Deselect All
                </button>
              </div>

              <button
                type="button"
                disabled={selectedTabs.length === 0}
                onClick={() => handleShareFormattedLinks(selectedTabs)}
                className="shrink-0 rounded-full bg-blue-500 px-2.5 py-1 text-[10px] font-medium text-white shadow-sm transition hover:bg-blue-600 disabled:pointer-events-none disabled:opacity-40"
              >
                {`Share Selected (${selectedTabs.length})`}
              </button>
            </div>
          )}

          {shareStatus && <p className="pb-1 text-[10px] text-neutral-500">{shareStatus}</p>}

          {bundle.tabs.map((tab) => (
            <div key={tab.id} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={selectedTabIds.has(tab.id)}
                onChange={() => toggleTabSelection(tab.id)}
                aria-label={`Select ${tab.title}`}
                className="size-3 shrink-0 rounded-sm border border-black/20 accent-blue-500"
              />
              <Favicon url={tab.favIconUrl} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-medium">{tab.title}</p>
                <p className="truncate text-[10px] text-neutral-400">{tab.url}</p>
              </div>
              <IconButton
                className="size-5"
                onClick={() => chrome.tabs.create({ url: tab.url })}
                aria-label="Open this tab"
              >
                <ExternalLinkIcon className="size-2.5" />
              </IconButton>
              <IconButton
                className="size-5"
                onClick={() => onDeleteTab(bundle.id, tab.id)}
                aria-label="Remove this tab from the bundle"
              >
                <XIcon className="size-2.5" />
              </IconButton>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
