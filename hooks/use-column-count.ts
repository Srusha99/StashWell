"use client"

import * as React from "react"

// The most columns that fit, rather than Tailwind breakpoints: the card grid is
// capped at 840px (components/bookmarks/dashboard-view.tsx), so any ordinary
// desktop window shows the same 4 columns. Breakpoints gave a 1366px laptop at
// 125% scaling (~1093px) 3 columns and a 1920px monitor 4, so an arrangement
// synced between them was re-dealt and every card moved.
// Widths are CSS px at 100% zoom - see the two width sources below for how
// that's kept true regardless of the page's actual zoom level.
const MAX_COLUMNS = 4
const GRID_MAX_WIDTH = 840
const GRID_GAP = 13
/** A card's width at 4 columns in the full-width grid - never squeezed narrower. */
const MIN_CARD_WIDTH = 200
/** The page's padding, plus the window frame and scrollbar chrome.windows counts. */
const PAGE_CHROME = 64

function countForWidth(width: number): number {
  const available = Math.min(width - PAGE_CHROME, GRID_MAX_WIDTH)
  for (let count = MAX_COLUMNS; count > 1; count--) {
    if (count * MIN_CARD_WIDTH + (count - 1) * GRID_GAP <= available) return count
  }
  return 1
}

function hasChromeWindows(): boolean {
  return typeof chrome !== "undefined" && !!chrome.windows
}

/**
 * `isReady` is false only for the brief window before the real count has
 * been measured - callers that persist per-column layout (useCardColumns)
 * must not treat that placeholder `count` as authoritative, or a saved
 * multi-column layout gets flattened and round-robined back out once the
 * real count arrives. See hooks/use-card-columns.ts.
 */
export interface ColumnCountState {
  count: number
  isReady: boolean
}

export function useColumnCount(): ColumnCountState {
  // Always starts at 1 so the client's first render matches the
  // window-less static export markup exactly; the real column count is
  // only picked up in the effect below, after hydration has completed.
  const [count, setCount] = React.useState(1)
  const [isReady, setIsReady] = React.useState(false)

  React.useEffect(() => {
    // window.innerWidth (and matchMedia, which is built on it) is a CSS-pixel
    // measurement that shrinks or grows with Chrome's page zoom - zooming in
    // reduces the CSS-pixel viewport even though nothing about the window
    // actually changed. That used to flip which breakpoint matched purely
    // from zooming, which resized every folder card and made its fixed-size
    // icon grid look like its spacing had changed. chrome.windows reports
    // the OS window's own size instead, which zoom never touches - only an
    // actual resize does - so the column count (and everything it drives)
    // stays put across zoom levels.
    if (hasChromeWindows()) {
      let cancelled = false
      const applyWindow = (win: chrome.windows.Window | undefined) => {
        if (cancelled || !win?.width) return
        setCount(countForWidth(win.width))
        setIsReady(true)
      }
      chrome.windows.getCurrent().then(applyWindow)
      chrome.windows.onBoundsChanged.addListener(applyWindow)
      return () => {
        cancelled = true
        chrome.windows.onBoundsChanged.removeListener(applyWindow)
      }
    }

    // Outside the extension (e.g. `next dev` in a regular browser tab)
    // there's no OS window size to ask for, so fall back to the CSS
    // viewport - it's zoom-sensitive, but that's dev-only here.
    const handleResize = () => {
      setCount(countForWidth(window.innerWidth))
      setIsReady(true)
    }
    window.addEventListener("resize", handleResize)
    handleResize()
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  return { count, isReady }
}
