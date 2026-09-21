export function faviconUrl(url: string, size = 32): string | undefined {
  try {
    const { hostname } = new URL(url)
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=${size}`
  } catch {
    return undefined
  }
}

/** The registrable domain, e.g. "web.whatsapp.com" -> "whatsapp.com". */
function rootDomain(hostname: string): string | null {
  const labels = hostname.split(".")
  if (labels.length <= 2) return null
  return labels.slice(-2).join(".")
}

function hasFaviconApi(): boolean {
  return typeof chrome !== "undefined" && !!chrome.runtime?.id
}

/**
 * Chrome's own cache of favicons for pages the user has actually visited -
 * e.g. localhost dev servers or intranet tools Google's crawler never
 * reaches. Only resolves inside the installed extension (requires the
 * "favicon" permission); returns undefined in a plain browser tab, e.g.
 * `next dev`.
 */
function chromeFaviconUrl(url: string, size: number): string | undefined {
  if (!hasFaviconApi()) return undefined
  const faviconUrl = new URL(chrome.runtime.getURL("/_favicon/"))
  faviconUrl.searchParams.set("pageUrl", url)
  faviconUrl.searchParams.set("size", String(size))
  return faviconUrl.toString()
}

/**
 * Favicon URLs to try in order. Google's favicon cache frequently has no
 * entry for a specific subdomain - e.g. web.whatsapp.com - even though it
 * has one for the registrable domain (whatsapp.com), and returns a 404 for
 * the ones it doesn't know, which browsers won't render as an <img>. The
 * apex domain and, last, Chrome's local favicon cache are offered as
 * fallback attempts before giving up entirely.
 */
export function faviconCandidates(url: string, size = 32): string[] {
  try {
    const { hostname } = new URL(url)
    const domains = [hostname]
    const root = rootDomain(hostname)
    if (root && root !== hostname) domains.push(root)
    const candidates = domains.map(
      (domain) => `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`
    )
    const chromeIcon = chromeFaviconUrl(url, size)
    if (chromeIcon) candidates.push(chromeIcon)
    return candidates
  } catch {
    return []
  }
}
