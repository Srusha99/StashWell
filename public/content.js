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
  // This script can land on a page that already has a copy of it: content
  // scripts can re-inject within the same tab (history.pushState, etc. can
  // re-trigger document_idle in some cases), and background.js re-injects
  // into every open tab after an install/update - where the copy from before
  // the update is still running, orphaned. So each new copy announces itself
  // first: a live copy cancels the event (see onReplaceRequest at the
  // bottom), meaning "already here, stay out", so a page never ends up with
  // two icons; an orphaned one removes itself instead and lets this copy
  // take over. DOM events cross between content-script worlds, so this
  // reaches a copy from the previous extension version too.
  const REPLACE_EVENT = "stashwell-content-script-injected"
  const liveCopyPresent = !document.dispatchEvent(new Event(REPLACE_EVENT, { cancelable: true }))
  if (liveCopyPresent) return

  const ICON_SIZE = 44
  const GAP = 8
  // Kept a bit wider than the dashboard popover's own 640px so the docked
  // panel reads as a comfortably-sized floating window rather than a cramped
  // tooltip. This is the only place the panel's width is set - the card in
  // components/kanban/kanban-panel.tsx stretches to fill the iframe exactly.
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
      /* Hidden (and unclickable) until the real position - saved or default
         - comes back from chrome.storage.local and gets applied. Painting
         at the synchronous fallback spot first and correcting it afterwards
         is what caused the icon to visibly jump/slide once storage
         resolved; staying invisible until then means it only ever appears
         already in its correct spot. See reveal() below. */
      opacity: 0;
      pointer-events: none;
      /* Only left/top ever change (see setIconPosition/snapToEdge) - this is
         what makes the post-drag snap-to-edge glide instead of jumping.
         .dragging turns it off below so the icon tracks the pointer with no
         lag while actually being dragged. */
      transition: left 200ms ease, top 200ms ease, background 150ms ease, opacity 150ms ease;
    }
    .icon-btn.ready {
      opacity: 1;
      pointer-events: auto;
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
      /* Must match the color-scheme kanban-panel.tsx forces on its own
         document. Chrome keeps an iframe see-through only while the <iframe>
         element's color-scheme and its document's agree - left to inherit the
         host page's instead (e.g. ChatGPT's color-scheme: dark), the mismatch
         makes Chrome paint the iframe's whole box opaque white behind the
         card. */
      color-scheme: light;
      /* The card fills this iframe edge to edge, so its rounded corners and
         drop shadow have to live out here - anything the card drew outside
         its own box would be clipped at the iframe's edge. Same values as
         the dashboard popover's rounded-2xl + ring-black/5 + shadow-2xl. */
      border-radius: 16px;
      box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.05), 0 25px 50px -12px rgba(0, 0, 0, 0.25);
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

  // Left edge by default (per product decision) - only a user drag to the
  // right side should ever put it there, and that gets remembered below.
  function defaultPosition() {
    return { left: 0, top: window.innerHeight / 2 - ICON_SIZE / 2 }
  }

  // Applies a position with the left/top CSS transition switched off, so
  // reveal() (below) can set the icon's final spot and un-hide it in the
  // same frame without a slide-in animation. Drags and resizes go through
  // setIconPosition directly and keep the normal animated transition.
  function setIconPositionInstant(left, top) {
    button.style.transition = "none"
    setIconPosition(left, top)
    // Force a reflow so the "none" transition is committed before handing
    // control back to the CSS transition (used for later drags/resizes).
    void button.offsetHeight
    button.style.transition = ""
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

  // Positioned synchronously (while still invisible via the CSS above) so
  // there's a sane left/top the instant it does become visible, in case
  // reveal() below ends up running off the timeout rather than the real
  // storage response.
  {
    const fallback = defaultPosition()
    setIconPosition(fallback.left, fallback.top)
  }

  // Makes the icon visible at its final position and only then - called
  // once, by whichever of the storage callback / safety timeout fires
  // first. chrome.storage.local.get's callback normally lands well within
  // the timeout, but on a busy page it can be queued behind other work for
  // a while; either way the icon stays hidden rather than flashing at the
  // wrong spot and jumping once the real answer arrives.
  let revealed = false
  function reveal(saved) {
    if (revealed) return
    revealed = true
    const target = saved
      ? snapToEdge(saved.xFraction * window.innerWidth, saved.yFraction * window.innerHeight)
      : defaultPosition()
    setIconPositionInstant(target.left, target.top)
    button.classList.add("ready")
  }

  chrome.storage.local.get(POSITION_KEY, (stored) => {
    const saved = stored && stored[POSITION_KEY]
    reveal(saved)
  })

  // Last-resort fallback in case the storage callback never fires (e.g. the
  // extension context was invalidated mid-navigation) - without this the
  // icon would stay invisible forever. Long enough that it should never
  // preempt a normal (if slow) storage response.
  setTimeout(() => reveal(null), 2000)

  // Keeps the icon on-screen (and the panel correctly anchored) if the
  // window is resized after the icon was placed.
  function onResize() {
    const rect = button.getBoundingClientRect()
    setIconPosition(rect.left, rect.top)
  }
  window.addEventListener("resize", onResize)

  // --- Dragging ---
  let dragPointerId = null
  let dragStart = null
  let moved = false

  button.addEventListener("pointerdown", (event) => {
    // Covers an extension update that landed while this tab was in the
    // foreground, so no visibilitychange (below) ever got the chance to
    // notice - the click just removes the dead icon instead of doing nothing.
    if (isOrphaned()) {
      teardown()
      return
    }
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
  function onPanelMessage(event) {
    const data = event.data
    if (!data || data.source !== "stashwell-kanban-panel") return
    lastPanelHeight = Number(data.height) || PANEL_HEIGHT_GUESS
    if (open) positionPanel()
  }
  window.addEventListener("message", onPanelMessage)

  // Closes on any click outside the icon/panel. composedPath() is what makes
  // this see through the shadow boundary to check whether the click actually
  // originated inside `host`.
  function onDocumentClick(event) {
    if (!open) return
    if (event.composedPath().includes(host)) return
    setOpen(false)
  }
  document.addEventListener("click", onDocumentClick, true)

  // --- Orphaned after an extension reload/update ---
  // Chrome doesn't unload this script, or the extension iframe it created,
  // when the extension is reloaded or updated - both keep running on any page
  // that was already open, but every chrome.* call from either now throws
  // "Extension context invalidated", leaving a dead icon and a board that
  // neither saves edits nor hears about anyone else's - it just keeps showing
  // whatever cards it had at the time. chrome.runtime.id going away is the
  // signal. Removing `host` also unloads the iframe, so its page stops
  // running entirely.
  function isOrphaned() {
    return !chrome.runtime?.id
  }

  function teardown() {
    host.remove()
    window.removeEventListener("resize", onResize)
    window.removeEventListener("message", onPanelMessage)
    document.removeEventListener("click", onDocumentClick, true)
    document.removeEventListener("visibilitychange", onVisibilityChange)
    document.removeEventListener(REPLACE_EVENT, onReplaceRequest)
  }

  // The usual way out: background.js injects the new version's copy right
  // after an install/update, and its REPLACE_EVENT (top of file) arrives here.
  function onReplaceRequest(event) {
    if (isOrphaned()) teardown()
    else event.preventDefault()
  }
  document.addEventListener(REPLACE_EVENT, onReplaceRequest)

  // Fallback for a tab background.js couldn't re-inject into: reloading the
  // extension means switching to chrome://extensions and back, so coming
  // back to this tab is the next moment worth checking.
  function onVisibilityChange() {
    if (isOrphaned()) teardown()
  }
  document.addEventListener("visibilitychange", onVisibilityChange)
})()
