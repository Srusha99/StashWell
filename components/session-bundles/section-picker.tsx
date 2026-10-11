"use client"

import * as React from "react"

import type { SaveGroup } from "@/lib/save-page"
import { cn } from "@/lib/utils"

interface Item {
  id: string
  title: string
  workspaceId: string
}

/** The gap between the button and the menu. */
const MENU_GAP = 6
/** Kept clear below the menu, so it doesn't sit flush on the popup's edge. */
const MENU_MARGIN = 8
/** Never squeezed shorter than this - about three cards, between search and footer. */
const MIN_MENU_HEIGHT = 200

/**
 * How tall the menu can be without reaching past whatever clips it - the
 * popup's own scroll area, which would otherwise grow scrollable to fit it -
 * or past the popup's edge.
 */
function menuHeightBelow(anchor: HTMLElement): number {
  let bottom = window.innerHeight
  for (let node = anchor.parentElement; node; node = node.parentElement) {
    if (getComputedStyle(node).overflowY !== "visible") {
      bottom = Math.min(bottom, node.getBoundingClientRect().bottom)
      break
    }
  }
  const room =
    bottom - anchor.getBoundingClientRect().bottom - MENU_GAP - MENU_MARGIN
  return Math.max(room, MIN_MENU_HEIGHT)
}

/**
 * Every workspace's cards as one list, in readSaveTargets' order: Personal's,
 * then each other workspace's - shown under a heading per workspace.
 */
function listItems(groups: SaveGroup[]): Item[] {
  return groups.flatMap((group) =>
    group.sections.map((section) => ({
      id: section.id,
      title: section.title,
      workspaceId: group.workspace.id,
    }))
  )
}

interface Run {
  workspaceId: string
  items: { item: Item; index: number }[]
}

/**
 * The shown cards split by workspace, for the headings - each keeping its index
 * in `shown`, since the arrow keys move through it as one list.
 */
function splitByWorkspace(shown: Item[]): Run[] {
  const runs: Run[] = []
  shown.forEach((item, index) => {
    const last = runs[runs.length - 1]
    if (last?.workspaceId === item.workspaceId) last.items.push({ item, index })
    else runs.push({ workspaceId: item.workspaceId, items: [{ item, index }] })
  })
  return runs
}

/** Shown until a card is chosen - nothing is picked for the user. */
const PLACEHOLDER = "Choose where to save"

export interface SectionPickerHandle {
  /** Opens the menu, e.g. when Save is clicked before anything was chosen. */
  open: () => void
}

/**
 * The Save Bookmark card's "Save to" dropdown: a search box, every
 * workspace's cards in one list - under a heading per workspace when there's
 * more than one - and "+ New section..." pinned below it, which asks which
 * workspace the section goes in whenever there's more than one. `groups` is
 * undefined while loading, and empty when no workspace's folder resolves.
 */
export function SectionPicker({
  ref,
  groups,
  selectedId,
  suggestedId,
  creatingIn,
  onSelect,
  onNewSection,
}: {
  ref?: React.Ref<SectionPickerHandle>
  groups: SaveGroup[] | undefined
  /** The chosen card, if any. */
  selectedId: string | null
  /** Highlighted when the menu opens with nothing chosen - the last card saved to. */
  suggestedId: string | null
  /** The workspace a new section is being named for, instead of a card chosen. */
  creatingIn: string | null
  onSelect: (sectionId: string) => void
  /** With whatever was typed in the search, to start the new section's name from. */
  onNewSection: (workspaceId: string, name: string) => void
}) {
  const [open, setOpen] = React.useState(false)
  // Measured each time it opens - see menuHeightBelow.
  const [menuHeight, setMenuHeight] = React.useState<number>()
  // "+ New section..." turned into one button per workspace, to pick where it goes.
  const [choosingWorkspace, setChoosingWorkspace] = React.useState(false)
  const [query, setQuery] = React.useState("")
  // The option Enter picks - moved by the arrow keys and the mouse.
  const [highlight, setHighlight] = React.useState(0)
  const rootRef = React.useRef<HTMLDivElement>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const listRef = React.useRef<HTMLDivElement>(null)
  const listId = React.useId()

  const items = React.useMemo(() => (groups ? listItems(groups) : []), [groups])
  const workspaceById = React.useMemo(
    () =>
      new Map(groups?.map((group) => [group.workspace.id, group.workspace])),
    [groups]
  )
  // A heading per workspace only when there's more than one to tell apart.
  const grouped = (groups?.length ?? 0) > 1
  const needle = query.trim().toLowerCase()
  const shown = needle
    ? items.filter((item) => item.title.toLowerCase().includes(needle))
    : items
  const runs = splitByWorkspace(shown)
  const selected = items.find((item) => item.id === selectedId)
  const creatingWorkspace = creatingIn
    ? workspaceById.get(creatingIn)
    : undefined

  function openMenu() {
    setQuery("")
    setChoosingWorkspace(false)
    // On the chosen card - or, with none yet, the last one saved to.
    const startOn = selectedId ?? suggestedId
    setHighlight(
      Math.max(
        0,
        items.findIndex((item) => item.id === startOn)
      )
    )
    if (rootRef.current) setMenuHeight(menuHeightBelow(rootRef.current))
    setOpen(true)
  }

  React.useImperativeHandle(ref, () => ({
    open: () => {
      if (groups?.length && !open) openMenu()
    },
  }))

  function close() {
    setOpen(false)
    setQuery("")
    setChoosingWorkspace(false)
  }

  function choose(id: string) {
    onSelect(id)
    close()
    triggerRef.current?.focus()
  }

  // With one workspace there's nothing to ask; with more, the footer asks.
  function startNewSection() {
    if (!groups?.length) return
    if (groups.length === 1) createIn(groups[0].workspace.id)
    else setChoosingWorkspace(true)
  }

  function createIn(workspaceId: string) {
    onNewSection(workspaceId, query.trim())
    close()
  }

  // A click anywhere outside closes it.
  React.useEffect(() => {
    if (!open) return
    function handleMouseDown(event: MouseEvent) {
      if (rootRef.current?.contains(event.target as Node)) return
      setOpen(false)
      setQuery("")
    }
    document.addEventListener("mousedown", handleMouseDown)
    return () => document.removeEventListener("mousedown", handleMouseDown)
  }, [open])

  // Keeps the highlighted option in view - on opening, that's the selected one.
  React.useEffect(() => {
    if (!open) return
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${highlight}"]`)
      ?.scrollIntoView({ block: "nearest" })
  }, [open, highlight])

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      if (shown.length === 0) return
      const step = event.key === "ArrowDown" ? 1 : -1
      setHighlight((index) =>
        Math.min(Math.max(index + step, 0), shown.length - 1)
      )
    } else if (event.key === "Enter") {
      event.preventDefault()
      const item = shown[highlight]
      // Nothing matches what was typed: that's the new section's name.
      if (item) choose(item.id)
      else startNewSection()
    }
  }

  // On the whole menu, not just the search box - focus may be on the
  // footer's workspace buttons. Handled here so Chrome doesn't take it as
  // closing the whole popup.
  function handleMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape") return
    event.preventDefault()
    close()
    triggerRef.current?.focus()
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        disabled={!groups || groups.length === 0}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close() : openMenu())}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-xl border bg-white px-4 py-3 text-[13px] font-semibold text-[#1a1a1a] shadow-[0_2px_4px_rgba(0,0,0,0.02)] transition-all duration-200 outline-none disabled:opacity-60",
          // Keyboard focus gets the same blue ring as open, not the browser's outline.
          open
            ? "border-[#3b82f6] shadow-[0_0_0_3px_rgba(59,130,246,0.1)]"
            : "border-[#e5e7eb] hover:border-[#d1d5db] hover:bg-[#fafafa] focus-visible:border-[#3b82f6] focus-visible:shadow-[0_0_0_3px_rgba(59,130,246,0.1)]"
        )}
      >
        <span
          className={cn(
            "truncate",
            creatingIn === null && !selected && "font-medium text-[#6b7280]"
          )}
        >
          {!groups
            ? "Loading sections..."
            : groups.length === 0
              ? "No sections"
              : creatingIn !== null
                ? grouped && creatingWorkspace
                  ? `+ New section in ${creatingWorkspace.name}`
                  : "+ New section"
                : (selected?.title ?? PLACEHOLDER)}
        </span>
        <span
          aria-hidden="true"
          className={cn(
            "shrink-0 text-[10px] text-[#9ca3af] transition-transform duration-300",
            open && "rotate-180 text-[#3b82f6]"
          )}
        >
          ▼
        </span>
      </button>

      {open && groups && (
        // Capped to the room left in the popup: the list shrinks (and
        // scrolls) to fit, so opening this never makes the popup bigger.
        <div
          style={{ maxHeight: menuHeight }}
          onKeyDown={handleMenuKeyDown}
          className="absolute top-[calc(100%+6px)] left-0 z-[100] flex w-full animate-in flex-col overflow-hidden rounded-xl border border-[#f0f0f0] bg-white shadow-[0_15px_35px_rgba(0,0,0,0.1)] duration-200 fade-in-0 slide-in-from-top-2"
        >
          <div className="shrink-0 border-b border-[#f3f4f6] px-2 pt-2 pb-1">
            <input
              autoFocus
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setHighlight(0)
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search sections..."
              aria-label="Search sections"
              aria-controls={listId}
              aria-activedescendant={
                shown[highlight] ? `${listId}-${highlight}` : undefined
              }
              className="w-full rounded-lg bg-[#f9fafb] px-3 py-2.5 text-xs font-medium text-[#1a1a1a] transition-colors outline-none placeholder:font-normal placeholder:text-[#9ca3af] focus:bg-[#f3f4f6]"
            />
          </div>

          {/* Scrolls by wheel or trackpad, with the scrollbar itself hidden -
              an option cut off at the bottom edge is what shows there's more. */}
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Sections"
            className="max-h-[240px] min-h-0 [scrollbar-width:none] overflow-y-auto p-1.5 [&::-webkit-scrollbar]:hidden"
          >
            {shown.length === 0 ? (
              <p className="px-3.5 py-2.5 text-xs text-[#9ca3af]">
                No sections match.
              </p>
            ) : (
              runs.map((run, runIndex) => {
                const workspace = workspaceById.get(run.workspaceId)
                return (
                  <div
                    key={run.workspaceId}
                    role="group"
                    aria-label={grouped ? workspace?.name : undefined}
                  >
                    {grouped && workspace && (
                      <div
                        aria-hidden="true"
                        className={cn(
                          "truncate px-3.5 pb-1 text-[10.5px] font-semibold tracking-[0.06em] text-[#9ca3af] uppercase",
                          runIndex === 0
                            ? "pt-1.5"
                            : "mt-1.5 border-t border-[#f3f4f6] pt-2.5"
                        )}
                      >
                        {workspace.emoji} {workspace.name}
                      </div>
                    )}
                    {run.items.map(({ item, index }) => {
                      const isSelected = item.id === selectedId
                      return (
                        <div
                          key={item.id}
                          id={`${listId}-${index}`}
                          data-index={index}
                          role="option"
                          aria-selected={isSelected}
                          onMouseEnter={() => setHighlight(index)}
                          onClick={() => choose(item.id)}
                          className={cn(
                            "mb-px flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3.5 py-2.5 text-[13px] transition-all duration-150",
                            isSelected
                              ? "bg-[#eef4ff] font-semibold text-[#3b82f6]"
                              : index === highlight
                                ? "bg-[#f3f4f6] font-medium text-[#1a1a1a]"
                                : "font-medium text-[#4b5563]"
                          )}
                        >
                          <span className="truncate">{item.title}</span>
                          {isSelected && (
                            <span
                              aria-hidden="true"
                              className="shrink-0 text-xs font-bold"
                            >
                              ✓
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })
            )}
          </div>

          <div className="shrink-0 border-t border-[#f0f0f0] bg-[#fafafa] p-1.5">
            {choosingWorkspace ? (
              <div role="group" aria-label="New section in">
                <p className="px-2 pt-1 pb-1.5 text-center text-[11px] font-medium text-[#9ca3af]">
                  New section in
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {groups.map((group, index) => (
                    <button
                      key={group.workspace.id}
                      type="button"
                      // Where focus goes once the footer turns into these,
                      // by click or by Enter on a search with no matches.
                      autoFocus={index === 0}
                      onClick={() => createIn(group.workspace.id)}
                      className="min-w-[120px] flex-1 truncate rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-xs font-semibold text-[#3b82f6] transition-all duration-150 outline-none hover:border-[#3b82f6]/40 hover:bg-[#eef4ff] focus-visible:border-[#3b82f6] focus-visible:shadow-[0_0_0_3px_rgba(59,130,246,0.1)]"
                    >
                      {group.workspace.emoji} {group.workspace.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={startNewSection}
                className="w-full rounded-lg px-3.5 py-2.5 text-center text-xs font-semibold text-[#3b82f6] transition-all duration-150 hover:bg-[#eef4ff]"
              >
                + New section...
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
