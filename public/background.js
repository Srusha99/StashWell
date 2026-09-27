/**
 * StashWell's MV3 service worker: the right-click "Save all open tabs in
 * window as bundle" context menu, plus the first-install onboarding tab.
 *
 * The Tab Session Bundles context menu opens the toolbar popup with its
 * "name this bundle" field already active (via a one-shot flag in
 * chrome.storage.local) rather than saving directly here - a background
 * script has no UI to ask for a name, and the popup already does, so both
 * ways of starting a save go through the exact same naming step.
 *
 * Plain JS on purpose: it is served straight out of public/ and is never passed
 * through the bundler, so it cannot use imports or TypeScript.
 *
 * Keep in sync with lib/session-bundles.ts.
 */

/**
 * Tab Session Bundles: key kept in sync with lib/session-bundles.ts.
 * Duplicated here (rather than imported) because this file is served
 * straight out of public/ and never passed through the bundler - see the
 * file header above.
 */
const PENDING_SAVE_KEY = "stashwell_pending_save"
const SAVE_SESSION_MENU_ID = "stashwell-save-session"

chrome.runtime.onInstalled.addListener((details) => {
  console.log("[StashWell] service worker installed.")

  // Only on a fresh install, not on every extension update/reload - those
  // fire onInstalled too, and re-showing the pin/new-tab walkthrough on each
  // update would be noise rather than help.
  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") })
  }

  // removeAll() first: onInstalled can also fire for an unpacked-extension
  // reload, and create() with a reused id would otherwise fail silently
  // (the failure only surfaces via runtime.lastError, not a thrown error).
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "stashwell-root",
      title: "StashWell",
      contexts: ["page"],
    })
    chrome.contextMenus.create({
      id: SAVE_SESSION_MENU_ID,
      parentId: "stashwell-root",
      title: "Save all open tabs in window as bundle",
      contexts: ["page"],
    })
  })
})

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== SAVE_SESSION_MENU_ID) return

  // openPopup() is called first and synchronously (not after an await) to
  // stay inside the click's own user-gesture window, which Chrome requires
  // for it to succeed.
  chrome.action.openPopup().catch((error) => {
    console.error("[StashWell] couldn't open the popup:", error)
  })
  chrome.storage.local.set({ [PENDING_SAVE_KEY]: true })
})
