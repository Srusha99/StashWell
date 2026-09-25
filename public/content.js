/**
 * StashWell's docked-icon content script: injects a small floating,
 * draggable icon on every http(s) page. Clicking it opens the Kanban board
 * (index.html?view=kanban-panel, same card the dashboard's Kanban popover
 * renders - see components/kanban/kanban-panel.tsx) in an iframe positioned
 * right next to wherever the icon currently is.
 *
 * Plain JS on purpose: served straight out of public/ as a manifest
 * content_scripts entry, never passed through the bundler, so it cannot use
 * imports or TypeScript (same constraint as background.js).
 */
;(function () {
  // Content scripts re-inject on every navigation within the same tab
  // (history.pushState, etc. can also re-trigger document_idle in some
  // cases) - guard so a page never ends up with two icons.
  if (document.documentElement.hasAttribute("data-stashwell-injected")) return
  document.documentElement.setAttribute("data-stashwell-injected", "true")

  const ICON_SIZE = 44
  const GAP = 8
  // Kept a bit wider than the dashboard popover's own 640px so the docked
  // panel reads as a comfortably-sized floating window rather than a cramped
  // tooltip - must match the w-[min(760px,...)] on the card in
  // components/kanban/kanban-panel.tsx.
  const PANEL_WIDTH = 760
  // Height is NOT fixed - kanban-panel.tsx measures its own card and posts
  // the real height back (see the "message" listener below). A fixed height
  // would always be wrong for however many cards happen to be in the board,
  // and Chrome paints that leftover dead space with an *opaque* fallback
  // color (white, or black in dark mode) instead of truly showing the host
  // page through it - so the only real fix is to never have dead space.
  // This is just the guess shown for the first frame or two, before the
  // panel's real measurement arrives.
  const PANEL_HEIGHT_GUESS = 320
  const POSITION_KEY = "stashwellIconPosition"

  // Appended to <html>, not <body> - some pages replace body.innerHTML
  // wholesale after initial load, which would silently delete the icon.
  const host = document.createElement("div")
  host.style.position = "fixed"
  host.style.top = "0"
  host.style.left = "0"
  host.style.zIndex = "2147483647"
  document.documentElement.appendChild(host)

  const shadow = host.attachShadow({ mode: "closed" })

  const style = document.createElement("style")
  style.textContent = `
    .icon-btn {
      position: fixed;
      width: ${ICON_SIZE}px;
      height: ${ICON_SIZE}px;
      border: none;
      /* border-radius is set inline per-side by applyIconShape - flat on
         whichever edge it's docked against (no gap/notch there), rounded on
         the outward-facing side, so it reads as a pill growing out of the
         screen edge rather than a rounded box sitting just inside it. */
      background: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
      cursor: grab;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      touch-action: none;
      /* Only left/top ever change (see setIconPosition/snapToEdge) - this is
         what makes the post-drag snap-to-edge glide instead of jumping.
         .dragging turns it off below so the icon tracks the pointer with no
         lag while actually being dragged. */
      transition: left 200ms ease, top 200ms ease, background 150ms ease;
    }
    .icon-btn:hover {
      background: rgba(255, 255, 255, 0.35);
    }
    .icon-btn.dragging {
      cursor: grabbing;
      transition: none;
      background: rgba(255, 255, 255, 0.35);
    }
    .icon-btn img {
      width: 32px;
      height: 32px;
      pointer-events: none;
    }
    .panel-frame {
      position: fixed;
      width: ${PANEL_WIDTH}px;
      max-width: calc(100vw - 16px);
      max-height: calc(100vh - 16px);
      border: none;
      background: transparent;
      opacity: 0;
      pointer-events: none;
      transform: scale(0.9);
      transition: opacity 160ms ease, transform 160ms ease, top 120ms ease, left 120ms ease, height 120ms ease;
    }
    .panel-frame.open {
      opacity: 1;
      pointer-events: auto;
      transform: scale(1);
    }
  `
  shadow.appendChild(style)

  const button = document.createElement("button")
  button.type = "button"
  button.className = "icon-btn"
  button.title = "Open Kanban Board · drag to move"
  button.setAttribute("aria-label", "Open Kanban Board")

  const icon = document.createElement("img")
  icon.src = chrome.runtime.getURL("icons/icon48.png")
  icon.alt = ""
  button.appendChild(icon)

  const frame = document.createElement("iframe")
  frame.className = "panel-frame"
  frame.src = chrome.runtime.getURL("index.html?view=kanban-panel")

  shadow.appendChild(frame)
  shadow.appendChild(button)

  // Declared up front (before setIconPosition, which reads it) rather than
  // down by setOpen/positionPanel where it's more topically at home - `let`
  // isn't hoisted with a usable value the way a `function` declaration is,
  // so reading it from the synchronous setIconPosition call below, before
  // this line had run, would throw.
  let open = false

  // --- Icon position: stored as a fraction of the viewport (not raw px) so
  // it still makes sense on a different-sized window/monitor than the one
  // it was dragged on, and applied on every page since chrome.storage is
  // shared across all tabs/sites this content script runs in. ---
  function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max))
  }

  const PILL_RADIUS = "18px"

  // Flat corners on whichever side touches the screen edge, rounded on the
  // other - a plain uniform border-radius left a visible rounded notch
  // between the button and the edge instead of sitting flush against it.
  // Mid-drag (neither edge) it's just rounded on all sides.
  function applyIconShape(left) {
    const atLeftEdge = left <= 0.5
    const atRightEdge = left >= window.innerWidth - ICON_SIZE - 0.5
    if (atLeftEdge) {
      button.style.borderRadius = `0 ${PILL_RADIUS} ${PILL_RADIUS} 0`
    } else if (atRightEdge) {
      button.style.borderRadius = `${PILL_RADIUS} 0 0 ${PILL_RADIUS}`
    } else {
      button.style.borderRadius = PILL_RADIUS
    }
  }

  function setIconPosition(left, top) {
    const clampedLeft = clamp(left, 0, window.innerWidth - ICON_SIZE)
    const clampedTop = clamp(top, 0, window.innerHeight - ICON_SIZE)
    button.style.left = `${clampedLeft}px`
    button.style.top = `${clampedTop}px`
    applyIconShape(clampedLeft)
    if (open) positionPanel()
  }

  function defaultPosition() {
    return { left: window.innerWidth - ICON_SIZE, top: window.innerHeight / 2 - ICON_SIZE / 2 }
  }

  // "Sticks to side" (like the reference extension icons) - after a drag,
  // the icon snaps horizontally to whichever edge it ended up closer to,
  // flush against it, while keeping whatever vertical spot it was dropped
  // at. Only the horizontal side snaps; dragging up/down stays free-form.
  function snapToEdge(left, top) {
    const center = left + ICON_SIZE / 2
    const snappedLeft = center < window.innerWidth / 2 ? 0 : window.innerWidth - ICON_SIZE
    return { left: snappedLeft, top }
  }

  // Applied synchronously so the icon has a sane position immediately -
  // chrome.storage.local.get is async, and without this the icon would
  // flash at the browser's default (0,0) for a frame while it resolves.
  {
    const fallback = defaultPosition()
    setIconPosition(fallback.left, fallback.top)
  }

  chrome.storage.local.get(POSITION_KEY, (stored) => {
    const saved = stored && stored[POSITION_KEY]
    if (!saved) return
    const snapped = snapToEdge(saved.xFraction * window.innerWidth, saved.yFraction * window.innerHeight)
    setIconPosition(snapped.left, snapped.top)
  })

  // Keeps the icon on-screen (and the panel correctly anchored) if the
  // window is resized after the icon was placed.
  window.addEventListener("resize", () => {
    const rect = button.getBoundingClientRect()
    setIconPosition(rect.left, rect.top)
  })

  // --- Dragging ---
  let dragPointerId = null
  let dragStart = null
  let moved = false

  button.addEventListener("pointerdown", (event) => {
    dragPointerId = event.pointerId
    dragStart = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      iconLeft: button.getBoundingClientRect().left,
      iconTop: button.getBoundingClientRect().top,
    }
    moved = false
    button.setPointerCapture(dragPointerId)
    button.classList.add("dragging")
  })

  button.addEventListener("pointermove", (event) => {
    if (dragPointerId === null || event.pointerId !== dragPointerId || !dragStart) return
    const dx = event.clientX - dragStart.pointerX
    const dy = event.clientY - dragStart.pointerY
    if (!moved && Math.hypot(dx, dy) > 4) moved = true
    if (!moved) return
    setIconPosition(dragStart.iconLeft + dx, dragStart.iconTop + dy)
  })

  button.addEventListener("pointerup", (event) => {
    if (dragPointerId === null || event.pointerId !== dragPointerId) return
    button.releasePointerCapture(dragPointerId)
    button.classList.remove("dragging")
    dragPointerId = null

    if (moved) {
      const rect = button.getBoundingClientRect()
      const snapped = snapToEdge(rect.left, rect.top)
      setIconPosition(snapped.left, snapped.top)
      chrome.storage.local.set({
        [POSITION_KEY]: {
          xFraction: snapped.left / window.innerWidth,
          yFraction: snapped.top / window.innerHeight,
        },
      })
    } else {
      // A drag with no real movement is just a click.
      setOpen(!open)
    }
  })

  // --- Panel open/close + positioning relative to wherever the icon is ---
  function setOpen(next) {
    open = next
    frame.classList.toggle("open", open)
    if (open) positionPanel()
  }

  let lastPanelHeight = PANEL_HEIGHT_GUESS

  function positionPanel() {
    const iconRect = button.getBoundingClientRect()
    const panelWidth = Math.min(PANEL_WIDTH, window.innerWidth - 16)
    const panelHeight = Math.min(lastPanelHeight, window.innerHeight - 16)

    const spaceRight = window.innerWidth - iconRect.right
    const openToRight = spaceRight >= panelWidth + GAP || spaceRight >= iconRect.left

    const left = openToRight
      ? clamp(iconRect.right + GAP, 8, window.innerWidth - panelWidth - 8)
      : clamp(iconRect.left - GAP - panelWidth, 8, window.innerWidth - panelWidth - 8)

    const top = clamp(
      iconRect.top + iconRect.height / 2 - panelHeight / 2,
      8,
      window.innerHeight - panelHeight - 8
    )

    frame.style.left = `${left}px`
    frame.style.top = `${top}px`
    frame.style.height = `${panelHeight}px`
    frame.style.transformOrigin = openToRight
      ? `left ${iconRect.top + iconRect.height / 2 - top}px`
      : `right ${iconRect.top + iconRect.height / 2 - top}px`
  }

  // kanban-panel.tsx's ResizeObserver reports the card's real height on
  // every change (cards added/removed, drag reorder) - this is what lets
  // the iframe hug the card exactly instead of leaving dead space around it.
  window.addEventListener("message", (event) => {
    const data = event.data
    if (!data || data.source !== "stashwell-kanban-panel") return
    lastPanelHeight = Number(data.height) || PANEL_HEIGHT_GUESS
    if (open) positionPanel()
  })

  // Closes on any click outside the icon/panel. composedPath() is what makes
  // this see through the shadow boundary to check whether the click actually
  // originated inside `host`.
  document.addEventListener(
    "click",
    (event) => {
      if (!open) return
      if (event.composedPath().includes(host)) return
      setOpen(false)
    },
    true
  )
})()
