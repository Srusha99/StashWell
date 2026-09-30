"use client"

import * as React from "react"

import SharedKanbanBoard from "@/components/spectrumui/kanbanboard"

/**
 * Renders inside content.js's docked-icon iframe (index.html?view=kanban-panel).
 * Same card chrome as the dashboard's Kanban popover
 * (components/bookmarks/dashboard-view.tsx) - rounded, white/dark, ring +
 * shadow - so the board looks identical wherever it's opened from. The ring
 * and shadow are drawn by content.js on the <iframe> element itself: this
 * card fills the iframe exactly, so anything it drew outside its own box
 * would be clipped. Unlike
 * components/kanban/kanban-board.tsx (a real OS popup window with its own
 * titlebar/close button), this has neither: the docked icon in content.js is
 * what shows/hides the iframe, so there's nothing here to close.
 */
export function KanbanPanel() {
  const cardRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const card = cardRef.current
    if (!card || window.parent === window) return

    // content.js can't measure this document's content itself (it's a
    // separate browsing context) - this reports the card's real height on
    // every change (cards added/removed, drag reorder) so the iframe can be
    // resized to hug it exactly instead of leaving a fixed-size box with
    // dead space around the card.
    const observer = new ResizeObserver(([entry]) => {
      window.parent.postMessage(
        { source: "stashwell-kanban-panel", height: Math.ceil(entry.target.getBoundingClientRect().height) },
        "*"
      )
    })
    observer.observe(card)
    return () => observer.disconnect()
  }, [])

  return (
    <>
      {/*
       * globals.css forces html/body to width:100%/height:100%/overflow:hidden
       * for the full-bleed New Tab dashboard, and gives body a background -
       * both wrong for an iframe meant to float a rounded card over a host
       * page. Transparent + auto-sized so only the card itself is visible.
       *
       * color-scheme is forced to light regardless of the card's own
       * dark:-variant classes below (next-themes otherwise sets it to
       * match the theme): Chrome keeps an iframe see-through only while
       * this document's color-scheme matches the <iframe> element's in the
       * host page, and paints an opaque canvas (black for dark, white for
       * light) on a mismatch. content.js pins the <iframe> element to light
       * too, so the two agree on every site and in either theme.
       */}
      <style>{`
        html, body {
          width: auto !important;
          height: auto !important;
          overflow: visible !important;
          background: transparent !important;
          color-scheme: light !important;
        }
      `}</style>
      {/*
       * max-h is a fixed px value, not the dashboard popover's vh-based one:
       * vh inside an iframe is relative to the iframe's OWN height, which
       * the ResizeObserver above drives from this very box's measured
       * height - a vh-based cap here would clamp the box, get measured as
       * shorter, shrink the iframe, re-shrink the vh cap, and so on into a
       * collapsing feedback loop instead of settling on the content's real
       * size. content.js separately clamps against the actual page's
       * viewport height, so this only needs to cap runaway card counts.
       *
       * w-full, not the popover's min(...,100vw-3rem): inside this iframe
       * 100vw is the iframe's own width (set by content.js), so that
       * subtracted margin just left a 3rem-wide strip of empty iframe
       * beside the card.
       */}
      <div
        ref={cardRef}
        className="w-full max-h-[600px] overflow-y-auto rounded-2xl border border-[var(--card-border)] bg-white p-6 dark:border-white/15 dark:bg-neutral-900"
      >
        <SharedKanbanBoard columnMinHeight="220px" />
      </div>
    </>
  )
}
