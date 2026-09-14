import defaultIcons from "./default-icons.json"

const PREFIX = "bm:icon:"
const ICON_SIZE = 64

// Strips the parts of a URL that commonly vary between otherwise-identical
// bookmarks of the same page - the account index Google-style multi-account
// URLs embed in the path (/u/0/, /u/1/, ...), the query string, and the
// hash - so e.g. a Gmail bookmark saved for account 2 without the
// "?tab=rm&ogbl" query still matches an icon captured for account 0 with it.
function normalizeUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname.replace(/\/u\/\d+(?=\/|$)/, "").replace(/\/+$/, "")
    return parsed.hostname + path
  } catch {
    return null
  }
}

const defaultIconsByNormalizedUrl: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  for (const [url, dataUrl] of Object.entries(defaultIcons as Record<string, string>)) {
    const normalized = normalizeUrl(url)
    if (normalized && !(normalized in map)) map[normalized] = dataUrl
  }
  return map
})()

// Custom icons are keyed by the bookmark's URL rather than its internal
// (chrome-generated, per-profile) id, so a local override and the
// baked-in defaults below both work regardless of which PC or profile
// the bookmark was created on.
export function getCustomIcon(url: string): string | null {
  try {
    const stored = window.localStorage.getItem(PREFIX + url)
    if (stored) return stored
  } catch {
    // ignore read failures
  }

  const exact = (defaultIcons as Record<string, string>)[url]
  if (exact) return exact

  const normalized = normalizeUrl(url)
  return (normalized && defaultIconsByNormalizedUrl[normalized]) ?? null
}

export function setCustomIcon(url: string, dataUrl: string): void {
  try {
    window.localStorage.setItem(PREFIX + url, dataUrl)
  } catch {
    // ignore write failures (e.g. storage disabled or quota exceeded)
  }
}

export function clearCustomIcon(url: string): void {
  try {
    window.localStorage.removeItem(PREFIX + url)
  } catch {
    // ignore
  }
}

export function readIconFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"))
    reader.onload = () => {
      const image = new Image()
      image.onerror = () => reject(new Error("Failed to decode image"))
      image.onload = () => {
        const canvas = document.createElement("canvas")
        canvas.width = ICON_SIZE
        canvas.height = ICON_SIZE
        const ctx = canvas.getContext("2d")
        if (!ctx) {
          reject(new Error("Canvas not supported"))
          return
        }
        const scale = Math.max(ICON_SIZE / image.width, ICON_SIZE / image.height)
        const drawWidth = image.width * scale
        const drawHeight = image.height * scale
        ctx.drawImage(
          image,
          (ICON_SIZE - drawWidth) / 2,
          (ICON_SIZE - drawHeight) / 2,
          drawWidth,
          drawHeight
        )
        resolve(canvas.toDataURL("image/png"))
      }
      image.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}
