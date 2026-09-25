"use client"

import * as React from "react"

import { KanbanIcon } from "@/components/icons/kanban-icon"
import SharedKanbanBoard from "@/components/spectrumui/kanbanboard"
import { hasStorageApi } from "@/lib/kanban"

/**
 * This runs inside a `chrome.windows.create({ type: "popup" })` window, which
 * already has its own OS title bar - but that native bar has no room for the
 * "StashWell · Kanban Board" label the design calls for, so this renders a
 * second, in-page one and makes it functionally draggable by nudging the
 * window's real screen position with chrome.windows.update on every
 * mousemove (there's no CSS-only way to move a browser window).
 */
function useWindowDrag() {
  const windowIdRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    if (!hasStorageApi() || typeof chrome === "undefined" || !chrome.windows) return
    chrome.windows.getCurrent().then((window) => {
      windowIdRef.current = window.id ?? null
    })
  }, [])

  return React.useCallback((event: React.MouseEvent) => {
    if (typeof chrome === "undefined" || !chrome.windows) return
    const windowId = windowIdRef.current
    if (windowId === null) return

    const startX = event.screenX
    const startY = event.screenY
    const startLeft = window.screenX
    const startTop = window.screenY

    function onMouseMove(moveEvent: MouseEvent) {
      if (windowId === null) return
      const left = startLeft + (moveEvent.screenX - startX)
      const top = startTop + (moveEvent.screenY - startY)
      chrome.windows.update(windowId, { left, top })
    }

    function onMouseUp() {
      document.removeEventListener("mousemove", onMouseMove)
      document.removeEventListener("mouseup", onMouseUp)
    }

    document.addEventListener("mousemove", onMouseMove)
    document.addEventListener("mouseup", onMouseUp)
  }, [])
}

export function KanbanBoard() {
  const onTitlebarMouseDown = useWindowDrag()

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50 text-slate-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div
        onMouseDown={onTitlebarMouseDown}
        className="flex shrink-0 cursor-grab items-center justify-between bg-gradient-to-br from-slate-800 to-slate-900 px-3 py-2 active:cursor-grabbing"
      >
        <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
          <KanbanIcon className="size-3 text-[#60a5fa]" />
          StashWell · Kanban Board
        </div>
        <button
          type="button"
          onClick={() => window.close()}
          className="flex size-5 items-center justify-center rounded-full bg-white/10 text-[10px] text-slate-300 transition hover:bg-red-500 hover:text-white"
        >
          ✕
        </button>
      </div>

      {/* Same board component the dashboard's Kanban popover renders - one
          implementation for add/edit/delete/drag/autosize, so this window
          can't silently drift out of sync with it again. */}
      <div className="flex-1 overflow-y-auto p-2.5">
        <SharedKanbanBoard variant="compact" />
      </div>
    </div>
  )
}
