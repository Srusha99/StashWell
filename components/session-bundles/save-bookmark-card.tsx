"use client"

import * as React from "react"
import { BookmarkCheckIcon, CheckIcon, CircleAlertIcon } from "lucide-react"

import {
  SectionPicker,
  type SectionPickerHandle,
} from "@/components/session-bundles/section-picker"
import { CARD } from "@/components/session-bundles/tones"
import {
  type CurrentPage,
  readCurrentPage,
  readLastSection,
  readSaveTargets,
  savePage,
  type SaveTargets,
} from "@/lib/save-page"
import { cn } from "@/lib/utils"

/**
 * What `selected` holds while a new section in that workspace is being named.
 * Cards are selected by their folder id, which is never in this form.
 */
const NEW_SECTION_PREFIX = "new:"

function newSectionValue(workspaceId: string): string {
  return `${NEW_SECTION_PREFIX}${workspaceId}`
}

/** The new section's name field - shaped like the dropdown above it (section-picker.tsx). */
const FIELD =
  "w-full rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-[13px] font-medium text-[#1a1a1a] shadow-[0_2px_4px_rgba(0,0,0,0.02)] outline-none transition-all duration-200 placeholder:font-normal placeholder:text-[#9ca3af] focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.1)]"

/** How long a toast stays up. */
const TOAST_MS = 2800

type Status =
  { kind: "idle" } | { kind: "saving" } | { kind: "saved"; title: string }

interface Toast {
  /** Bumped per toast, so a repeat of the same message still replays its entrance. */
  id: number
  tone: "info" | "error"
  message: string
}

/**
 * Save Bookmark: which dashboard card the current tab's page goes into - any
 * workspace's, or a new section in one - and the button. Nothing is chosen
 * for the user: the dropdown says "Choose where to save" until they pick, and
 * opens on the card they last saved to. Anything worth saying about a save
 * (already saved, can't be saved, failed) is a toast that floats below the
 * card rather than a line in it. See lib/save-page.ts.
 */
export function SaveBookmarkCard() {
  // Both undefined while loading. A null page is one that can't be bookmarked
  // (the new tab page, chrome:// pages); null targets mean no workspace's
  // folder resolves.
  const [page, setPage] = React.useState<CurrentPage | null>()
  const [targets, setTargets] = React.useState<SaveTargets | null>()
  // A card's folder id, a new section's newSectionValue, or "" for nothing yet.
  const [selected, setSelected] = React.useState("")
  const [lastSection, setLastSection] = React.useState<string | null>(null)
  const [newSection, setNewSection] = React.useState("")
  const [status, setStatus] = React.useState<Status>({ kind: "idle" })
  const [toast, setToast] = React.useState<Toast | null>(null)
  const pickerRef = React.useRef<SectionPickerHandle>(null)

  React.useEffect(() => {
    let active = true
    void (async () => {
      const current = await readCurrentPage().catch(() => null)
      // The cards are read even for a page that can't be saved, so the popup
      // looks the same everywhere - saving it is what says no.
      const found = await readSaveTargets(current?.url ?? null).catch(
        () => null
      )
      if (!active) return
      setPage(current)
      setTargets(found)
      setLastSection(readLastSection())
    })()
    return () => {
      active = false
    }
  }, [])

  React.useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast])

  function showToast(tone: Toast["tone"], message: string) {
    setToast((current) => ({ id: (current?.id ?? 0) + 1, tone, message }))
  }

  const creatingIn = selected.startsWith(NEW_SECTION_PREFIX)
    ? selected.slice(NEW_SECTION_PREFIX.length)
    : null
  const selectedGroup = targets?.groups.find((group) =>
    creatingIn !== null
      ? group.workspace.id === creatingIn
      : group.sections.some((section) => section.id === selected)
  )
  const canSave =
    page !== undefined &&
    targets !== undefined &&
    status.kind !== "saving" &&
    status.kind !== "saved" &&
    (creatingIn === null || newSection.trim() !== "")

  async function handleSave() {
    if (!canSave) return
    if (!page) {
      showToast("error", "This page can't be saved as a bookmark.")
      return
    }
    if (!targets) {
      showToast(
        "error",
        "Open a new tab to fix your workspace's folder, then try again."
      )
      return
    }
    // One copy of a page is enough - say where it is instead of adding another.
    if (targets.savedIn) {
      const { group, section } = targets.savedIn
      showToast(
        "info",
        `Already saved in ${group.workspace.name} › ${section.title}`
      )
      return
    }
    // Nothing chosen yet: the menu opening is the answer.
    if (!selectedGroup) {
      pickerRef.current?.open()
      return
    }

    setStatus({ kind: "saving" })
    let section
    try {
      section = await savePage(
        targets,
        creatingIn !== null
          ? { newSection, workspaceId: creatingIn }
          : { sectionId: selected },
        page
      )
    } catch {
      section = null
    }
    if (!section) {
      setStatus({ kind: "idle" })
      showToast("error", "Couldn't save this page - try again.")
      return
    }
    setNewSection("")
    setStatus({ kind: "saved", title: section.title })
    // Re-read so a section just created is in the list, already selected, and
    // the page now counts as saved. The save itself has gone through either way.
    setTargets(await readSaveTargets(page.url).catch(() => targets))
    setSelected(section.id)
  }

  // Any change after a save starts a new one.
  function edit(apply: () => void) {
    apply()
    if (status.kind !== "saving") setStatus({ kind: "idle" })
  }

  // The workspace is the one picked in the dropdown's footer (section-picker.tsx)
  // - the user's choice, never inferred from the card chosen before.
  function startNewSection(workspaceId: string, name: string) {
    edit(() => {
      setSelected(newSectionValue(workspaceId))
      if (name) setNewSection(name)
    })
  }

  return (
    <div className="relative">
      <div className={cn(CARD, "flex flex-col gap-2.5 p-3")}>
        <SectionPicker
          ref={pickerRef}
          groups={targets === null ? [] : targets?.groups}
          selectedId={creatingIn === null && selected !== "" ? selected : null}
          suggestedId={lastSection}
          creatingIn={creatingIn}
          onSelect={(sectionId) => edit(() => setSelected(sectionId))}
          onNewSection={startNewSection}
        />

        {creatingIn !== null && (
          <input
            autoFocus
            aria-label="New section name"
            placeholder={`New section in ${selectedGroup?.workspace.name ?? "this workspace"}...`}
            value={newSection}
            onChange={(event) => edit(() => setNewSection(event.target.value))}
            onKeyDown={(event) => {
              if (event.key === "Enter") void handleSave()
            }}
            className={FIELD}
          />
        )}

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!canSave}
          className={cn(
            "flex h-11 w-full items-center justify-center gap-2 rounded-[14px] px-4 text-[0.85rem] font-semibold text-white shadow-[0_4px_12px_rgba(15,23,42,0.18)] transition disabled:pointer-events-none",
            status.kind === "saved"
              ? "bg-[#059669]"
              : "bg-[#1c1c1e] hover:-translate-y-px hover:bg-black hover:shadow-[0_6px_16px_rgba(15,23,42,0.24)] disabled:opacity-50"
          )}
        >
          {status.kind === "saved" ? (
            <>
              <CheckIcon className="size-4 shrink-0" />
              <span className="truncate">Saved to {status.title}</span>
            </>
          ) : (
            <>
              <span aria-hidden="true">🔖</span>
              {status.kind === "saving" ? "Saving..." : "Save Bookmark"}
            </>
          )}
        </button>
      </div>

      {/* Floats over whatever's below the card, so it never moves anything or
          makes the popup bigger. */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none absolute inset-x-0 top-full z-[90] mt-2 flex justify-center px-2"
      >
        {toast && (
          <div
            key={toast.id}
            className="flex max-w-full animate-in items-center gap-2 rounded-xl bg-[#1c1c1e] px-3.5 py-2.5 text-[0.72rem] font-medium text-white shadow-[0_10px_25px_rgba(15,23,42,0.25)] duration-200 fade-in-0 slide-in-from-top-1"
          >
            {toast.tone === "info" ? (
              <BookmarkCheckIcon className="size-4 shrink-0 text-[#60a5fa]" />
            ) : (
              <CircleAlertIcon className="size-4 shrink-0 text-[#f87171]" />
            )}
            <span className="min-w-0">{toast.message}</span>
          </div>
        )}
      </div>
    </div>
  )
}
