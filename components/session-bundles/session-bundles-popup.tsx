"use client"

import * as React from "react"
import { LinkIcon, ListIcon, type LucideIcon } from "lucide-react"

import { ActiveBundlesSheet } from "@/components/session-bundles/active-bundles-sheet"
import { BundlePill } from "@/components/session-bundles/bundle-pill"
import { BundleUsageBadge } from "@/components/session-bundles/bundle-usage"
import { ShareTabsPanel } from "@/components/session-bundles/share-tabs-panel"
import { CARD, MUTED, POPUP_BACKGROUND, TEXT, TONES, type Tone } from "@/components/session-bundles/tones"
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
import { bundleLimit, canSaveBundle } from "@/lib/bundle-gate"
import { useIsPro } from "@/hooks/use-is-pro"
import { useAuth } from "@/lib/auth-context"
import { cn } from "@/lib/utils"

/** One of the Save / Share pair at the top of the popup. */
function ActionCard({
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
        CARD,
        "flex flex-col items-center px-3 py-3.5 transition hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]",
        active && colors.active
      )}
    >
      <span className={cn("mb-2.5 flex size-10 shrink-0 items-center justify-center rounded-full", colors.icon)}>
        <Icon className="size-5" />
      </span>
      <p className="mb-[3px] text-[0.8rem] font-semibold">{title}</p>
      <p className={cn("mb-3 flex-1 text-center text-[0.65rem] leading-[1.4]", MUTED)}>{description}</p>
      <button
        type="button"
        onClick={onClick}
        aria-expanded={active}
        className={cn(
          "w-full rounded-full px-4 py-2.5 text-[0.75rem] font-semibold tracking-[0.01em] text-white transition",
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
  const isPro = useIsPro()
  // The plan isn't known until the session has loaded - deciding before then
  // would hold a Pro user to Free's limit for a moment.
  const { loading: planLoading } = useAuth()
  // The Active Bundles sheet: from the usage badge, or in place of the save
  // step once Free's limit is reached.
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [pendingSave, setPendingSave] = React.useState(false)
  const atLimit = !planLoading && bundles !== null && !canSaveBundle(isPro, bundles.length).allowed
  const showFreePlan = !planLoading && !isPro

  React.useEffect(() => {
    readSessionBundles().then(setBundles)
    // The right-click context menu opens this popup rather than saving
    // directly (see public/background.js) so both ways of starting a save
    // land on the exact same "type a name, hit Save" step.
    consumePendingSaveFlag().then(setPendingSave)
  }, [])

  // That step goes through the same limit check as the Save button, once the
  // bundles and the plan have both loaded.
  if (pendingSave && !planLoading && bundles !== null) {
    setPendingSave(false)
    if (atLimit) setSheetOpen(true)
    else setIsCreating(true)
  }

  // Saving and sharing are deliberately separate flows - opening one closes
  // the other, so it's never ambiguous whether an action will persist a
  // bundle (Save) or only touch the clipboard (Share).
  function toggleCreating() {
    if (planLoading) return
    setIsSharing(false)
    if (!isCreating && atLimit) {
      setSheetOpen(true)
      return
    }
    setIsCreating((value) => !value)
  }

  const closeSheet = React.useCallback(() => setSheetOpen(false), [])

  function handleSaveNew() {
    setSheetOpen(false)
    setIsSharing(false)
    setIsCreating(true)
  }

  function toggleSharing() {
    setIsCreating(false)
    setEmptyWindowNotice(false)
    setIsSharing((value) => !value)
  }

  async function handleSave() {
    if (planLoading) return
    setIsSaving(true)
    setEmptyWindowNotice(false)
    try {
      // Checked again where it's saved, against what's in storage right now -
      // another popup or tab may have saved one since this popup opened.
      const result = await createSessionBundleFromCurrentWindow(nameDraft, bundleLimit(isPro))
      if (result.status === "empty") {
        setEmptyWindowNotice(true)
        return
      }
      if (result.status === "limit-reached") {
        setIsCreating(false)
        setBundles(await readSessionBundles())
        setSheetOpen(true)
        return
      }
      setBundles((current) => [result.bundle, ...(current ?? [])])
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
       * The background is inline rather than a theme token: this popup has its
       * own fixed look regardless of the dashboard's appearance settings.
       */}
      <style>{`
        html, body {
          width: auto !important;
          height: auto !important;
          overflow: visible !important;
          background: ${POPUP_BACKGROUND} !important;
        }
      `}</style>
      {/* Chrome caps extension popups at 600px tall; past that, this scrolls -
          by wheel or trackpad, with the scrollbar itself hidden. A bundle row
          cut off at the bottom edge is what shows there's more. */}
      <div
        className={cn(
          "flex max-h-[600px] min-h-[160px] w-[380px] flex-col overflow-y-auto p-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          TEXT
        )}
        style={{ background: POPUP_BACKGROUND }}
      >
        <div className="mb-5 flex flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <ActionCard
              tone="save"
              icon={ListIcon}
              title="Save Session"
              description="Save all tabs as a bundle."
              actionLabel="Save Bundle"
              active={isCreating}
              onClick={toggleCreating}
            />
            <ActionCard
              tone="share"
              icon={LinkIcon}
              title="Quick Share"
              description="Send links instantly."
              actionLabel="Share Now"
              active={isSharing}
              onClick={toggleSharing}
            />
          </div>

          {isSharing && <ShareTabsPanel />}

          {isCreating && (
            <div className="flex items-center gap-2 rounded-full border border-[#e2e8f0] bg-white p-1 pl-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] focus-within:border-[#3b82f6] focus-within:ring-2 focus-within:ring-[#3b82f6]/15">
              <input
                autoFocus
                placeholder="Name this bundle, e.g. Q3 Research"
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleSave()
                  if (event.key === "Escape") setIsCreating(false)
                }}
                className="h-8 min-w-0 flex-1 bg-transparent text-[0.75rem] outline-none placeholder:text-[#94a3b8]"
              />
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className={cn(
                  "h-8 shrink-0 rounded-full px-4 text-[0.75rem] font-semibold text-white transition disabled:opacity-50",
                  TONES.save.button
                )}
              >
                {isSaving ? "Saving..." : "Save"}
              </button>
            </div>
          )}

          {emptyWindowNotice && (
            <p className={cn("px-1 text-xs", MUTED)}>This window has no tabs StashWell can bundle.</p>
          )}
        </div>

        <div className="mb-2.5 flex items-center justify-between px-1">
          <p className="text-[0.8rem] font-bold">Saved Bundles</p>
          {showFreePlan && bundles !== null && (
            <BundleUsageBadge count={bundles.length} onClick={() => setSheetOpen(true)} />
          )}
        </div>

        <div className="flex flex-col gap-2">
          {!hasTabsApi() ? (
            <p className={cn("py-6 text-center text-xs", MUTED)}>
              Tab access isn&apos;t available here - open this popup from the installed
              extension.
            </p>
          ) : bundles === null ? (
            <p className={cn("py-6 text-center text-xs", MUTED)}>Loading...</p>
          ) : bundles.length === 0 ? (
            <p className={cn("py-4 text-center text-xs", MUTED)}>No saved bundles yet.</p>
          ) : (
            bundles.map((bundle) => (
              <BundlePill
                key={bundle.id}
                bundle={bundle}
                onRestore={handleRestore}
                onRename={handleRename}
                onDelete={handleDelete}
                onDeleteTab={handleDeleteTab}
                expandable
              />
            ))
          )}
        </div>
      </div>

      {showFreePlan && bundles !== null && (
        <ActiveBundlesSheet
          open={sheetOpen}
          onClose={closeSheet}
          bundles={bundles}
          atLimit={atLimit}
          onSaveNew={handleSaveNew}
          onRestore={handleRestore}
          onDelete={handleDelete}
        />
      )}
    </>
  )
}
