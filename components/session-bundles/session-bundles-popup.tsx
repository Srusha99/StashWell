"use client"

import * as React from "react"
import { LinkIcon, SaveIcon, type LucideIcon } from "lucide-react"

import { BundleCard, GLASS_CARD_STYLE } from "@/components/session-bundles/bundle-card"
import { ShareTabsPanel } from "@/components/session-bundles/share-tabs-panel"
import { TONES, type Tone } from "@/components/session-bundles/tones"
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
import { cn } from "@/lib/utils"

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

/** One square tile of the Save / Share pair at the top of the popup. */
function ActionColumn({
  tone,
  icon: Icon,
  title,
  description,
  actionLabel,
  active,
  onClick,
}: {
  tone: Tone
  icon: LucideIcon
  title: string
  description: string
  actionLabel: string
  active: boolean
  onClick: () => void
}) {
  const colors = TONES[tone]
  return (
    <div
      className={cn(
        "flex size-[140px] shrink-0 flex-col items-center rounded-2xl border border-black/5 bg-white/70 p-2.5 text-center backdrop-blur-xl transition",
        active && colors.active
      )}
      style={GLASS_CARD_STYLE}
    >
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", colors.icon)}>
        <Icon className="size-4" />
      </span>
      <p className="mt-1.5 text-xs font-semibold">{title}</p>
      <p className="mt-0.5 text-[10px] leading-snug text-neutral-500">{description}</p>
      <button
        type="button"
        onClick={onClick}
        aria-expanded={active}
        className={cn(
          "mt-auto w-full rounded-full py-1.5 text-[11px] font-semibold text-white shadow-sm transition active:scale-[0.97]",
          colors.button
        )}
      >
        {actionLabel}
      </button>
    </div>
  )
}

export function SessionBundlesPopup() {
  const [bundles, setBundles] = React.useState<SessionBundle[] | null>(null)
  const [isCreating, setIsCreating] = React.useState(false)
  const [nameDraft, setNameDraft] = React.useState("")
  const [isSaving, setIsSaving] = React.useState(false)
  const [emptyWindowNotice, setEmptyWindowNotice] = React.useState(false)
  const [isSharing, setIsSharing] = React.useState(false)

  React.useEffect(() => {
    readSessionBundles().then(setBundles)
    // The right-click context menu opens this popup rather than saving
    // directly (see public/background.js) so both ways of starting a save
    // land on the exact same "type a name, hit Save" step.
    consumePendingSaveFlag().then((pending) => {
      if (pending) setIsCreating(true)
    })
  }, [])

  // Saving and sharing are deliberately separate flows - opening one closes
  // the other, so it's never ambiguous whether an action will persist a
  // bundle (Save) or only touch the clipboard (Share).
  function toggleCreating() {
    setIsSharing(false)
    setIsCreating((value) => !value)
  }

  function toggleSharing() {
    setIsCreating(false)
    setEmptyWindowNotice(false)
    setIsSharing((value) => !value)
  }

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
      {/* Width is exactly the two 140px tiles + their 12px gap + a 12px
          gutter each side, so every section below shares the tiles' edges.
          Chrome caps extension popups at 600px tall; 560 leaves room for the
          tiles plus a fully open share list without an outer scroll. */}
      <div
        className="flex max-h-[560px] min-h-[160px] w-[316px] flex-col overflow-y-auto text-neutral-900"
        style={BACKGROUND}
      >
        <p className="px-3 pt-3 pb-2 text-base font-bold tracking-tight">StashWell</p>

        <div className="flex gap-3 px-3 pb-2">
          <ActionColumn
            tone="save"
            icon={SaveIcon}
            title="Save Session"
            description="Save all tabs as a bundle for later."
            actionLabel="Save Bundle"
            active={isCreating}
            onClick={toggleCreating}
          />
          <ActionColumn
            tone="share"
            icon={LinkIcon}
            title="Quick Share"
            description="Send links instantly without saving."
            actionLabel="Share Now"
            active={isSharing}
            onClick={toggleSharing}
          />
        </div>

        {isSharing && <ShareTabsPanel />}

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
              className="shrink-0 rounded-full bg-[#1A73E8] px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-[#1765CC] disabled:opacity-50"
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

        <p className="px-3 pt-1 pb-1.5 text-[11px] font-semibold text-neutral-500">Saved bundles</p>

        <div className="flex flex-col gap-1.5 px-3 pb-3">
          {!hasTabsApi() ? (
            <p className="py-6 text-center text-xs text-neutral-500">
              Tab access isn&apos;t available here - open this popup from the installed
              extension.
            </p>
          ) : bundles === null ? (
            <p className="py-6 text-center text-xs text-neutral-500">Loading...</p>
          ) : bundles.length === 0 ? (
            <p className="py-4 text-center text-xs text-neutral-500">No saved bundles yet.</p>
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

