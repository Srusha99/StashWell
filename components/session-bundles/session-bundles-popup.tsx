"use client"

import * as React from "react"
import { PlusIcon } from "lucide-react"

import { BundleCard } from "@/components/session-bundles/bundle-card"
import {
  consumePendingSaveFlag,
  createSessionBundleFromCurrentWindow,
  deleteSessionBundle,
  deleteTabFromBundle,
  hasTabsApi,
  readSessionBundles,
  renameSessionBundle,
  restoreSessionBundle,
  type SessionBundle,
} from "@/lib/session-bundles"

// Soft off-white background with faint color tints, inline rather than a
// shared theme token: this popup deliberately has its own fixed look
// regardless of the dashboard's light/dark/appearance settings. The tints
// are what a glass card's backdrop-blur actually softens - a flat single
// color gives blur nothing to do and it reads as invisible.
const BACKGROUND_COLOR = "#f2f1f4"
const BACKGROUND = {
  background:
    "radial-gradient(55% 45% at 12% 0%, rgba(219,234,254,0.6), transparent 60%)," +
    "radial-gradient(50% 40% at 92% 8%, rgba(254,226,226,0.55), transparent 60%)," +
    "radial-gradient(60% 50% at 100% 70%, rgba(254,243,199,0.4), transparent 60%)," +
    `${BACKGROUND_COLOR}`,
}

export function SessionBundlesPopup() {
  const [bundles, setBundles] = React.useState<SessionBundle[] | null>(null)
  const [isCreating, setIsCreating] = React.useState(false)
  const [nameDraft, setNameDraft] = React.useState("")
  const [isSaving, setIsSaving] = React.useState(false)
  const [emptyWindowNotice, setEmptyWindowNotice] = React.useState(false)

  React.useEffect(() => {
    readSessionBundles().then(setBundles)
    // The right-click context menu opens this popup rather than saving
    // directly (see public/background.js) so both ways of starting a save
    // land on the exact same "type a name, hit Save" step.
    consumePendingSaveFlag().then((pending) => {
      if (pending) setIsCreating(true)
    })
  }, [])

  async function handleSave() {
    setIsSaving(true)
    setEmptyWindowNotice(false)
    try {
      const bundle = await createSessionBundleFromCurrentWindow(nameDraft)
      if (!bundle) {
        setEmptyWindowNotice(true)
        return
      }
      setBundles((current) => [bundle, ...(current ?? [])])
      setNameDraft("")
      setIsCreating(false)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleRestore(bundle: SessionBundle) {
    await restoreSessionBundle(bundle)
  }

  async function handleRename(id: string, name: string) {
    await renameSessionBundle(id, name)
    setBundles(
      (current) =>
        current?.map((bundle) => (bundle.id === id ? { ...bundle, name: name.trim() } : bundle)) ?? null
    )
  }

  async function handleDelete(id: string) {
    await deleteSessionBundle(id)
    setBundles((current) => current?.filter((bundle) => bundle.id !== id) ?? null)
  }

  async function handleDeleteTab(bundleId: string, tabId: string) {
    await deleteTabFromBundle(bundleId, tabId)
    setBundles(
      (current) =>
        current?.map((bundle) =>
          bundle.id === bundleId
            ? {
                ...bundle,
                tabs: bundle.tabs.filter((tab) => tab.id !== tabId),
                tabCount: bundle.tabCount - 1,
              }
            : bundle
        ) ?? null
    )
  }

  return (
    <>
      {/*
       * globals.css forces html/body to width:100%/height:100%/overflow:hidden
       * for the full-bleed New Tab dashboard. A Chrome extension popup has no
       * viewport to resolve that 100% against, so left as-is it renders
       * blank/collapsed. This page is its own separate static-export
       * document, so a plain !important override here only ever affects this
       * render, and being plain CSS it applies on first paint with no
       * dependency on React having hydrated yet. height/overflow are auto so
       * the popup's real size comes from its content instead of a fixed box.
       */}
      <style>{`
        html, body {
          width: auto !important;
          height: auto !important;
          overflow: visible !important;
          background: ${BACKGROUND_COLOR} !important;
        }
      `}</style>
      <div
        className="flex max-h-[420px] min-h-[160px] w-[300px] flex-col overflow-y-auto text-neutral-900"
        style={BACKGROUND}
      >
        <div className="flex items-center justify-between px-3 pt-3 pb-2">
          <div>
            <p className="text-sm font-bold tracking-tight">StashWell</p>
            <p className="text-[11px] text-neutral-500">Tab Session Bundles</p>
          </div>
          <button
            type="button"
            onClick={() => setIsCreating((value) => !value)}
            className="flex items-center gap-1 rounded-full bg-blue-500 px-3 py-1 text-xs font-medium text-white shadow-sm transition hover:bg-blue-600 active:scale-[0.97]"
          >
            <PlusIcon className="size-3" />
            Save tabs
          </button>
        </div>

        {isCreating && (
          <div className="flex items-center gap-1.5 px-3 pb-2">
            <input
              autoFocus
              placeholder="e.g. Q3 Market Research"
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleSave()
                if (event.key === "Escape") setIsCreating(false)
              }}
              className="h-8 min-w-0 flex-1 rounded-xl border border-black/10 bg-white/70 px-2.5 text-xs text-neutral-900 placeholder:text-neutral-400 outline-none backdrop-blur-xl focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="shrink-0 rounded-full bg-blue-500 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-blue-600 disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        )}

        {emptyWindowNotice && (
          <p className="px-3 pb-2 text-[11px] text-neutral-500">
            This window has no tabs StashWell can bundle.
          </p>
        )}

        <div className="flex flex-col gap-1.5 px-2 pb-3">
          {!hasTabsApi() ? (
            <p className="py-6 text-center text-xs text-neutral-500">
              Tab access isn&apos;t available here - open this popup from the installed
              extension.
            </p>
          ) : bundles === null ? (
            <p className="py-6 text-center text-xs text-neutral-500">Loading...</p>
          ) : bundles.length === 0 ? (
            <p className="py-6 text-center text-xs text-neutral-500">
              No saved bundles yet. Click &ldquo;Save tabs&rdquo; to bundle everything open in
              this window.
            </p>
          ) : (
            bundles.map((bundle) => (
              <BundleCard
                key={bundle.id}
                bundle={bundle}
                onRestore={handleRestore}
                onRename={handleRename}
                onDelete={handleDelete}
                onDeleteTab={handleDeleteTab}
              />
            ))
          )}
        </div>
      </div>
    </>
  )
}

