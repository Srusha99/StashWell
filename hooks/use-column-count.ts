"use client"

import * as React from "react"

// Matches the sm/lg/xl breakpoints the dashboard's Pinterest-style columns
// use, so the JS-driven layout always agrees with Tailwind's breakpoints.
// Widths are CSS px at 100% zoom - see the two width sources below for how
// that's kept true regardless of the page's actual zoom level.
const BREAKPOINTS: { minWidth: number; count: number }[] = [
  { minWidth: 1280, count: 4 },
  { minWidth: 1024, count: 3 },
  { minWidth: 640, count: 2 },
]

function countForWidth(width: number): number {
  for (const bp of BREAKPOINTS) {
    if (width >= bp.minWidth) return bp.count
  }
  return 1
}

function hasChromeWindows(): boolean {
  return typeof chrome !== "undefined" && !!chrome.windows
}

export function useColumnCount(): number {
  // Always starts at 1 so the client's first render matches the
  // window-less static export markup exactly; the real column count is
  // only picked up in the effect below, after hydration has completed.
  const [count, setCount] = React.useState(1)

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
    const handleResize = () => setCount(countForWidth(window.innerWidth))
    window.addEventListener("resize", handleResize)
    handleResize()
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  return count
}
