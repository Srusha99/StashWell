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
 */
const placeholderByteLength = new Map<number, number | null>()

async function getPlaceholderByteLength(size: number): Promise<number | null> {
  if (placeholderByteLength.has(size)) return placeholderByteLength.get(size)!

  let length: number | null = null
  try {
    const probeDomain = `stashwell-favicon-probe-${Math.random().toString(36).slice(2)}.invalid`
    const response = await fetch(googleFaviconUrl(probeDomain, size))
    if (response.ok) length = (await response.blob()).size
  } catch {
    length = null
  }

  placeholderByteLength.set(size, length)
  return length
}

/**
 * Fetches Google's favicon for a domain and returns it only if it's a real
 * icon - i.e. its byte length doesn't match the known placeholder
 * fingerprint for this size. Returns null on any failure (network error,
 * CORS, or a confirmed placeholder) rather than throwing, since every
 * caller treats "no real icon from this source" the same way regardless of
 * why.
 */
async function fetchRealGoogleIcon(domain: string, size: number): Promise<Blob | null> {
  try {
    const response = await fetch(googleFaviconUrl(domain, size))
    if (!response.ok) return null
    const blob = await response.blob()
    const placeholderLength = await getPlaceholderByteLength(size)
    if (placeholderLength !== null && blob.size === placeholderLength) return null
    return blob
  } catch {
    return null
  }
}

/**
 * Resolves the actual image bytes to render for a bookmark's favicon, or
 * null if no real icon exists anywhere - render `fallback` in that case.
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
 * Requires being able to read Google's response bytes cross-origin, which
 * needs the "https://www.google.com/*" host_permission (fetch() from an
 * extension with a matching host permission bypasses CORS entirely).
 * Outside the extension - no favicon API, e.g. plain `next dev` - there's
 * no way to do this check, so this just hands back the plain URL directly
 * and accepts the placeholder risk, matching the pre-existing dev-only
 * behavior.
 */
export async function resolveFaviconSrc(url: string, size: number): Promise<string | null> {
  let hostname: string
  try {
    hostname = new URL(url).hostname
  } catch {
    return null
  }

  if (!hasFaviconApi()) {
    return googleFaviconUrl(hostname, size)
  }

  const exact = await fetchRealGoogleIcon(hostname, size)
  if (exact) return URL.createObjectURL(exact)

  return chromeFaviconUrl(url, size) ?? null
}
