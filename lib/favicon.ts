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

/**
 * Favicon URLs to try in order. Google's favicon cache frequently has no
 * entry for a specific subdomain - e.g. web.whatsapp.com - even though it
 * has one for the registrable domain (whatsapp.com), and returns a 404 for
 * the ones it doesn't know, which browsers won't render as an <img>. The
 * apex domain is offered as a fallback attempt before giving up entirely.
 */
export function faviconCandidates(url: string, size = 32): string[] {
  try {
    const { hostname } = new URL(url)
    const domains = [hostname]
    const root = rootDomain(hostname)
    if (root && root !== hostname) domains.push(root)
    return domains.map(
      (domain) => `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`
    )
  } catch {
    return []
  }
}
