/**
 * Tab Session Bundles: named snapshots of every tab in a window, saved to
 * `chrome.storage.local` so they survive a browser restart.
 *
 * Storage key and shape are kept in sync with the plain-JS duplicate in
 * `public/background.js` (which opens this popup from the right-click context
 * menu and can't import this module - see that file's header comment).
 */

export interface SessionTab {
  id: string
  title: string
  url: string
  favIconUrl: string
}

export interface SessionBundle {
  id: string
  name: string
  createdAt: string
  tabCount: number
  tabs: SessionTab[]
}

type SessionBundleMap = Record<string, SessionBundle>

export const STORAGE_KEY = "stashwell_sessions"

/**
 * One-shot signal the right-click context menu leaves for the popup to pick
 * up on mount: "open with the name field already active." Kept in sync with
 * PENDING_SAVE_KEY in public/background.js.
 */
export const PENDING_SAVE_KEY = "stashwell_pending_save"

/** Reads and clears the pending-save flag in one step - it's one-shot. */
export async function consumePendingSaveFlag(): Promise<boolean> {
  if (!hasTabsApi()) return false
  const stored = await chrome.storage.local.get(PENDING_SAVE_KEY)
  if (!stored?.[PENDING_SAVE_KEY]) return false
  await chrome.storage.local.remove(PENDING_SAVE_KEY)
  return true
}

export function hasTabsApi(): boolean {
  return typeof chrome !== "undefined" && !!chrome.tabs
}

let warned = false
function warnUnavailable() {
  if (warned) return
  warned = true
  console.warn(
    "chrome.tabs is not available in this context (expected outside the extension, e.g. `next dev` in a regular browser tab)."
  )
}

/** Excludes internal pages that can't meaningfully be restored as a tab. */
export function isInternalUrl(url: string | undefined | null): boolean {
  if (!url) return true
  return (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url === "about:blank"
  )
}

/** A readable default name for bundles nobody named, e.g. from the context menu. */
export function defaultBundleName(date: Date = new Date()): string {
  return `Tabs – ${date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`
}

function isSessionTab(value: unknown): value is SessionTab {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as Partial<SessionTab>
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.url === "string" &&
    candidate.url.length > 0 &&
    typeof candidate.favIconUrl === "string"
  )
}

function isSessionBundle(value: unknown): value is SessionBundle {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as Partial<SessionBundle>
  return (
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    typeof candidate.name === "string" &&
    typeof candidate.createdAt === "string" &&
    Array.isArray(candidate.tabs) &&
    candidate.tabs.every(isSessionTab)
  )
}

async function readSessionBundleMap(): Promise<SessionBundleMap> {
  if (!hasTabsApi()) {
    warnUnavailable()
    return {}
  }

  const stored = await chrome.storage.local.get(STORAGE_KEY)
  const raw = stored?.[STORAGE_KEY]
  if (typeof raw !== "object" || raw === null) return {}

  const map: SessionBundleMap = {}
  for (const [id, value] of Object.entries(raw)) {
    if (isSessionBundle(value)) map[id] = { ...value, tabCount: value.tabs.length }
  }
  return map
}

async function writeSessionBundleMap(map: SessionBundleMap): Promise<void> {
  if (!hasTabsApi()) {
    warnUnavailable()
    return
  }
  await chrome.storage.local.set({ [STORAGE_KEY]: map })
}

/** All saved bundles, newest first. */
export async function readSessionBundles(): Promise<SessionBundle[]> {
  const map = await readSessionBundleMap()
  return Object.values(map).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
}

function tabToSessionTab(tab: chrome.tabs.Tab, index: number): SessionTab | null {
  if (isInternalUrl(tab.url)) return null
  return {
    id: `tab_${index + 1}`,
    title: tab.title || tab.url || "Untitled",
    url: tab.url ?? "",
    favIconUrl: tab.favIconUrl ?? "",
  }
}

/** Reserves a bundle id, suffixing on the rare same-millisecond collision. */
function reserveBundleId(map: SessionBundleMap): string {
  const base = `session_${Date.now()}`
  if (!map[base]) return base

  let attempt = 1
  let id = `${base}_${attempt}`
  while (map[id]) {
    attempt += 1
    id = `${base}_${attempt}`
  }
  return id
}

/**
 * Snapshots every non-internal tab in the current window into a new named
 * bundle. Returns null when there's nothing to save (no tabs, or no
 * chrome.tabs API - e.g. running the popup outside the extension).
 */
export async function createSessionBundleFromCurrentWindow(
  name: string
): Promise<SessionBundle | null> {
  if (!hasTabsApi()) {
    warnUnavailable()
    return null
  }

  const tabs = await chrome.tabs.query({ currentWindow: true })
  const sessionTabs = tabs
    .map((tab, index) => tabToSessionTab(tab, index))
    .filter((tab): tab is SessionTab => tab !== null)

  if (sessionTabs.length === 0) return null

  const map = await readSessionBundleMap()
  const id = reserveBundleId(map)
  const bundle: SessionBundle = {
    id,
    name: name.trim() || defaultBundleName(),
    createdAt: new Date().toISOString(),
    tabCount: sessionTabs.length,
    tabs: sessionTabs,
  }

  map[id] = bundle
  await writeSessionBundleMap(map)
  return bundle
}

export async function deleteSessionBundle(id: string): Promise<void> {
  const map = await readSessionBundleMap()
  if (!map[id]) return
  delete map[id]
  await writeSessionBundleMap(map)
}

export async function renameSessionBundle(id: string, name: string): Promise<void> {
  const map = await readSessionBundleMap()
  const bundle = map[id]
  if (!bundle) return
  const trimmed = name.trim()
  if (!trimmed || trimmed === bundle.name) return
  map[id] = { ...bundle, name: trimmed }
  await writeSessionBundleMap(map)
}

export async function deleteTabFromBundle(bundleId: string, tabId: string): Promise<void> {
  const map = await readSessionBundleMap()
  const bundle = map[bundleId]
  if (!bundle) return
  const tabs = bundle.tabs.filter((tab) => tab.id !== tabId)
  if (tabs.length === bundle.tabs.length) return
  map[bundleId] = { ...bundle, tabs, tabCount: tabs.length }
  await writeSessionBundleMap(map)
}

/**
 * Resolves once a tab has enough metadata to display when discarded (a title
 * or favicon, or it's simply finished loading) - or after a safety timeout.
 * chrome.tabs.create has no `discarded` option, and discarding immediately
 * after creation, before the tab has painted anything, leaves Chrome with no
 * title/favicon to show and the tab strip reads "Untitled" forever.
 */
function waitForTabMetadata(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(finish, 4000)

    function finish() {
      clearTimeout(timeout)
      chrome.tabs.onUpdated.removeListener(listener)
      resolve()
    }

    function listener(updatedTabId: number, changeInfo: chrome.tabs.OnUpdatedInfo) {
      if (updatedTabId !== tabId) return
      if (
        changeInfo.title !== undefined ||
        changeInfo.favIconUrl !== undefined ||
        changeInfo.status === "complete"
      ) {
        finish()
      }
    }

    chrome.tabs.onUpdated.addListener(listener)
  })
}

async function createDiscardedTab(windowId: number, url: string): Promise<void> {
  const created = await chrome.tabs.create({ windowId, url, active: false })
  if (created?.id === undefined) return

  await waitForTabMetadata(created.id)

  try {
    await chrome.tabs.discard(created.id)
  } catch {
    // Chrome can refuse to discard a tab in some states; it still opened,
    // just not lazily.
  }
}

/**
 * Restores a bundle into a brand-new window: the first tab opens active, and
 * every other tab loads just long enough to pick up a title/favicon before
 * being discarded (see createDiscardedTab) - done in parallel so restoring
 * several tabs isn't gated on each one loading in turn.
 */
export async function restoreSessionBundle(bundle: SessionBundle): Promise<void> {
  if (!hasTabsApi() || bundle.tabs.length === 0) {
    warnUnavailable()
    return
  }

  const [first, ...rest] = bundle.tabs
  const window = await chrome.windows.create({ url: first.url })
  const windowId = window?.id
  if (windowId === undefined) return

  await Promise.all(rest.map((tab) => createDiscardedTab(windowId, tab.url)))
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export function tabsToMarkdownLinks(tabs: SessionTab[]): string {
  return tabs.map((tab) => `- [${tab.title}](${tab.url})`).join("\n")
}

/** Real `<a>` tags, one per line - the "hyperlinked text" half of a formatted-links copy. */
export function tabsToHtmlLinks(tabs: SessionTab[]): string {
  return tabs
    .map((tab) => `<a href="${escapeHtml(tab.url)}">${escapeHtml(tab.title || tab.url)}</a>`)
    .join("<br>")
}

export function bundleToMarkdown(bundle: SessionBundle): string {
  return [`# ${bundle.name}`, "", tabsToMarkdownLinks(bundle.tabs)].join("\n")
}

export function bundleToPlainText(bundle: SessionBundle): string {
  const lines = bundle.tabs.map((tab) => `• ${tab.title} — ${tab.url}`)
  return [bundle.name, ...lines].join("\n")
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const textarea = document.createElement("textarea")
      textarea.value = text
      textarea.style.position = "fixed"
      textarea.style.opacity = "0"
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand("copy")
      document.body.removeChild(textarea)
      return true
    } catch {
      return false
    }
  }
}

/**
 * Copies both a Markdown list (text/plain) and real `<a>` tags (text/html) in
 * one write, so pasting into a rich-text target (email, Docs, Slack) yields
 * clickable hyperlinks while pasting into a plain-text/Markdown target yields
 * the Markdown source. Falls back to a plain-text Markdown copy when the
 * multi-type Clipboard API isn't available (e.g. an older browser context).
 */
export async function copyFormattedLinks(tabs: SessionTab[]): Promise<boolean> {
  const markdown = tabsToMarkdownLinks(tabs)

  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([tabsToHtmlLinks(tabs)], { type: "text/html" }),
          "text/plain": new Blob([markdown], { type: "text/plain" }),
        }),
      ])
      return true
    } catch {
      // Some browsers restrict multi-type clipboard writes outside a direct
      // user gesture; fall back to the plain-text copy below.
    }
  }

  return copyToClipboard(markdown)
}

function toBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input)
  let binary = ""
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/**
 * Packs the given tabs into a compact Base64url payload shaped as a URL hash
 * fragment (`#stashwell-tabs=...`), for pasting anywhere a plain string is
 * easier to share than a live link - a chat message, a note, a ticket.
 */
export function encodeTabsAsHash(tabs: SessionTab[]): string {
  const payload = tabs.map((tab) => ({ t: tab.title, u: tab.url }))
  return `#stashwell-tabs=${toBase64Url(JSON.stringify(payload))}`
}

/** A standalone HTML page listing each tab as a clickable link - no CSS/JS dependencies. */
export function tabsToHtmlDocument(title: string, tabs: SessionTab[]): string {
  const items = tabs
    .map(
      (tab) =>
        `    <li><a href="${escapeHtml(tab.url)}">${escapeHtml(tab.title || tab.url)}</a></li>`
    )
    .join("\n")

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 640px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; }
  h1 { font-size: 18px; }
  ul { list-style: none; padding: 0; margin: 16px 0 0; }
  li { padding: 8px 0; border-bottom: 1px solid #eee; }
  a { color: #2563eb; text-decoration: none; word-break: break-all; }
  a:hover { text-decoration: underline; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<ul>
${items}
</ul>
</body>
</html>
`
}

/** A safe base filename from a bundle name, e.g. "Q3 Research!" -> "q3-research". */
export function slugifyFilename(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || "shared-tabs"
}

/** Triggers a browser download of `content` as `filename` - no extension permission needed. */
export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}
