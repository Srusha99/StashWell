export function hasFaviconApi(): boolean {
  return typeof chrome !== "undefined" && !!chrome.runtime?.id
}

/**
 * Chrome's own favicon resource, with `allowGoogleServerFallback` set so
 * Chrome checks its local favicon cache *and*, if that misses, queries
 * Google's favicon servers itself. Used only as a last resort below - it
 * turns out not to be reliable enough to gate on: Chrome's own live
 * network fallback has a short timeout and fails for some perfectly normal
 * sites (slow to respond, etc.), which is a false negative distinct from
 * (but just as wrong as) Google's public endpoint's false positives. Only
 * resolves inside the installed extension (requires the "favicon"
 * permission); returns undefined in a plain browser tab, e.g. `next dev`.
 */
function chromeFaviconUrl(url: string, size: number): string | undefined {
  if (!hasFaviconApi()) return undefined
  const faviconUrl = new URL(chrome.runtime.getURL("/_favicon/"))
  faviconUrl.searchParams.set("pageUrl", url)
  faviconUrl.searchParams.set("size", String(size))
  faviconUrl.searchParams.set("allowGoogleServerFallback", "1")
  return faviconUrl.toString()
}

function googleFaviconUrl(domain: string, size: number): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`
}

/**
 * Google's `s2/favicons` never 404s for a domain it doesn't recognize - it
 * returns 200 with a generic placeholder baked into the response, and that
 * placeholder is byte-for-byte identical for every domain it doesn't
 * recognize at a given size (it's a static asset, not personalized per
 * domain). Probing a domain that's guaranteed not to exist (the ".invalid"
 * TLD is reserved for exactly this by RFC 2606) once per size and caching
 * its response's byte length gives a reliable fingerprint to compare real
 * responses against - see fetchRealGoogleIcon. Memoized for the session:
 * this is one extra request per distinct size the app actually uses (a
 * small, fixed set), not per bookmark.
 *
 * The promise is what's memoized, not the length it resolves to - memoizing
 * the length meant every icon that asked before the first probe answered (on
 * a dashboard load, all of them) sent a probe of its own.
 */
const placeholderByteLength = new Map<number, Promise<number | null>>()

function getPlaceholderByteLength(size: number): Promise<number | null> {
  let pending = placeholderByteLength.get(size)
  if (!pending) {
    pending = (async () => {
      try {
        const probeDomain = `stashwell-favicon-probe-${Math.random().toString(36).slice(2)}.invalid`
        const response = await fetch(googleFaviconUrl(probeDomain, size))
        return response.ok ? (await response.blob()).size : null
      } catch {
        return null
      }
    })()
    placeholderByteLength.set(size, pending)
  }
  return pending
}

/** A slow answer from Google falls back to Chrome's own icon rather than leaving the slot blank. */
const GOOGLE_TIMEOUT_MS = 8000

/**
 * Fetches Google's favicon for a domain. "none" only when Google answered and
 * has no real icon - a 404, or a body matching the known placeholder
 * fingerprint for this size - since that's the answer worth remembering.
 * "unreachable" for a network error, CORS failure or timeout, which says
 * nothing about the domain and is retried on the next load.
 */
async function fetchRealGoogleIcon(
  domain: string,
  size: number
): Promise<Blob | "none" | "unreachable"> {
  try {
    const response = await fetch(googleFaviconUrl(domain, size), {
      signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
    })
    if (!response.ok) return response.status === 404 ? "none" : "unreachable"
    const blob = await response.blob()
    const placeholderLength = await getPlaceholderByteLength(size)
    if (placeholderLength !== null && blob.size === placeholderLength) return "none"
    return blob
  } catch {
    return "unreachable"
  }
}

/* -------------------------------------------------------------------------- */
/* Cache                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Every Google answer is kept in IndexedDB, per hostname and size, so a
 * dashboard load after the first draws every icon on its first render instead
 * of waiting on one network round trip per bookmark. Only Google's answers are
 * stored: Chrome's resource is local and instant already, so a host Google has
 * no icon for is stored as null and goes straight to it.
 *
 * Old answers are still shown at once, then re-checked in the background, so
 * a site that changes its icon - or that Google learns about later - catches
 * up on a later load without ever leaving a slot blank.
 */
const DB_NAME = "bm-favicons"
const DB_VERSION = 1
const STORE_NAME = "google"
const REFRESH_ICON_AFTER_MS = 14 * 24 * 60 * 60 * 1000
const REFRESH_NONE_AFTER_MS = 3 * 24 * 60 * 60 * 1000

/**
 * Raw bytes rather than a Blob: Chrome writes every Blob in IndexedDB out to
 * a file of its own, which made saving a first dashboard load's worth slow
 * enough that most were lost if the tab was closed soon after.
 */
interface StoredFavicon {
  /** Google's icon, or null when Google has none for this host at this size. */
  bytes: ArrayBuffer | null
  type: string
  checkedAt: number
}

/** Object URLs of cached icons (null: Google has none), shared by every component showing that host. */
const memory = new Map<string, string | null>()
const stale = new Set<string>()
const inflight = new Map<string, Promise<string | null | "unreachable">>()

function cacheKey(hostname: string, size: number): string {
  return `${size}:${hostname}`
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    // A failed open isn't retried every lookup - icons just aren't cached this session.
    dbPromise.catch(() => {})
  }
  return dbPromise
}

async function loadCache(): Promise<void> {
  const db = await openDb()
  const [keys, values] = await new Promise<[IDBValidKey[], StoredFavicon[]]>((resolve, reject) => {
    const store = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME)
    const keysRequest = store.getAllKeys()
    const valuesRequest = store.getAll()
    valuesRequest.onsuccess = () => resolve([keysRequest.result, valuesRequest.result])
    valuesRequest.onerror = () => reject(valuesRequest.error)
  })
  const now = Date.now()
  keys.forEach((key, index) => {
    const entry = values[index]
    if (typeof key !== "string" || !entry || memory.has(key)) return
    memory.set(key, entry.bytes ? URL.createObjectURL(new Blob([entry.bytes], { type: entry.type })) : null)
    const maxAge = entry.bytes ? REFRESH_ICON_AFTER_MS : REFRESH_NONE_AFTER_MS
    if (now - entry.checkedAt > maxAge) stale.add(key)
  })
}

const unsaved = new Map<string, StoredFavicon>()
let saveScheduled = false

async function saveToCache(key: string, icon: Blob | null): Promise<void> {
  try {
    const bytes = icon ? await icon.arrayBuffer() : null
    unsaved.set(key, { bytes, type: icon?.type ?? "", checkedAt: Date.now() })
  } catch {
    return // Not cached - asked again next load.
  }
  // Whatever else lands in the same task joins this transaction. Not delayed
  // any longer than that: a new tab is often left within a second or two
  // (typing in the address bar), and anything not committed by then is lost.
  if (saveScheduled) return
  saveScheduled = true
  setTimeout(() => void saveBatch(), 0)
}

async function saveBatch(): Promise<void> {
  saveScheduled = false
  const batch = [...unsaved]
  unsaved.clear()
  try {
    const db = await openDb()
    // Relaxed: a cache can lose its last few writes in a crash, at no cost
    // beyond asking Google again.
    const transaction = db.transaction(STORE_NAME, "readwrite", { durability: "relaxed" })
    const store = transaction.objectStore(STORE_NAME)
    for (const [key, entry] of batch) store.put(entry, key)
    transaction.commit()
  } catch {
    // Not cached - asked again next load, same as before there was a cache.
  }
}

/** Removes every cached answer, here and on disk - Privacy > Clear local cache. */
export async function clearFaviconCache(): Promise<void> {
  memory.clear()
  stale.clear()
  unsaved.clear()
  if (typeof indexedDB === "undefined") return
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite")
      transaction.objectStore(STORE_NAME).clear()
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  } catch {
    // Nothing readable to clear.
  }
}

// Started on import, not on the first lookup: it runs alongside the bookmark
// tree and layout reads the dashboard waits on anyway, so it's normally done
// before the first card - and its first icon - renders.
const cacheReady: Promise<void> =
  typeof indexedDB !== "undefined" && hasFaviconApi() ? loadCache().catch(() => {}) : Promise.resolve()

function lookUpGoogle(hostname: string, size: number): Promise<string | null | "unreachable"> {
  const key = cacheKey(hostname, size)
  let pending = inflight.get(key)
  if (!pending) {
    pending = fetchRealGoogleIcon(hostname, size).then((result) => {
      inflight.delete(key)
      if (result === "unreachable") return result
      stale.delete(key)
      const icon = result === "none" ? null : result
      // The previous object URL isn't revoked: an icon already on screen may
      // still be showing it. A handful of small blobs for the page's life.
      const objectUrl = icon ? URL.createObjectURL(icon) : null
      memory.set(key, objectUrl)
      void saveToCache(key, icon)
      return objectUrl
    })
    inflight.set(key, pending)
  }
  return pending
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

/** Google's icon if cached; Chrome's resource if Google is known to have none. */
function fromMemory(url: string, key: string, size: number): string | null {
  return memory.get(key) ?? chromeFaviconUrl(url, size) ?? null
}

/**
 * The favicon source to render right now, without waiting: what
 * resolveFaviconSrc would resolve to, when that's already known. Undefined
 * when it isn't - a host not looked up yet, or the cache still loading.
 */
export function peekFaviconSrc(url: string, size: number): string | null | undefined {
  const hostname = hostnameOf(url)
  if (!hostname) return null
  if (!hasFaviconApi()) return googleFaviconUrl(hostname, size)

  const key = cacheKey(hostname, size)
  return memory.has(key) ? fromMemory(url, key, size) : undefined
}

/**
 * Resolves the actual image to render for a bookmark's favicon, or null if no
 * real icon exists anywhere - render `fallback` in that case.
 *
 * Google's exact-hostname icon is tried first, verified against
 * getPlaceholderByteLength so a domain Google hasn't crawled is correctly
 * treated as "no icon" instead of silently accepted. Chrome's own resource
 * - which resolves against the exact page URL, not a simplified domain - is
 * the fallback for when that's a real miss.
 *
 * Deliberately NOT falling back to the apex/registrable domain (e.g.
 * web.whatsapp.com -> whatsapp.com) the way the old, non-verified version
 * did: that's actively wrong for any big host with many distinct products on
 * subdomains - notebooklm.google.com has no icon of its own in Google's
 * index, but google.com very much does, so guessing the apex domain
 * confidently returned the plain Google "G" logo for NotebookLM instead of
 * falling through to a source that actually has the right one. Chrome's
 * per-URL lookup doesn't have that failure mode, so there's no good reason
 * to guess at a coarser domain first.
 *
 * Answers come from the cache above when there is one, and bookmarks on the
 * same host share a single request when there isn't.
 *
 * Requires being able to read Google's response bytes cross-origin, which
 * needs the "https://www.google.com/*" host_permission (fetch() from an
 * extension with a matching host permission bypasses CORS entirely).
 * Outside the extension - no favicon API, e.g. plain `next dev` - there's
 * no way to do this check, so this just hands back the plain URL directly
 * and accepts the placeholder risk, matching the pre-existing dev-only
 * behavior.
 */
export async function resolveFaviconSrc(url: string, size: number): Promise<string | null> {
  const hostname = hostnameOf(url)
  if (!hostname) return null
  if (!hasFaviconApi()) return googleFaviconUrl(hostname, size)

  await cacheReady
  const key = cacheKey(hostname, size)
  if (memory.has(key)) {
    if (stale.has(key)) void lookUpGoogle(hostname, size)
    return fromMemory(url, key, size)
  }

  const result = await lookUpGoogle(hostname, size)
  return (result === "unreachable" ? null : result) ?? chromeFaviconUrl(url, size) ?? null
}
