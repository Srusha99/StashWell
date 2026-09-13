export function faviconUrl(url: string, size = 32): string | undefined {
  try {
    const { hostname } = new URL(url)
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=${size}`
  } catch {
    return undefined
  }
}
