/**
 * What each plan may upload as a custom wallpaper. Uploads never leave the
 * device (lib/custom-background-store.ts), so these limits are about keeping
 * Free simple and giving Pro something worth paying for, not about storage
 * costs.
 *
 *  - Free: 1 upload, a still image (JPG, PNG or WebP) up to 5 MB.
 *  - Pro: 10 uploads, images plus animated wallpapers (MP4, WebM, GIF), up to
 *    100 MB each - plus the daily slideshow (hooks/use-daily-wallpaper.ts).
 */

const MB = 1024 * 1024

export const WALLPAPER_LIMITS = {
  free: { slots: 1, maxBytes: 5 * MB },
  pro: { slots: 10, maxBytes: 100 * MB },
} as const

/** Still images: allowed on every plan. */
const IMAGE_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
}

/** Videos and GIFs - "live" wallpapers: Pro only. Every GIF counts, since
 * telling a still one from an animated one would mean decoding it. */
const LIVE_TYPES: Record<string, string> = {
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
}

/** For the file picker - everything either plan can pick, so a Free user who
 * picks a video is told it's a Pro feature rather than not seeing it at all. */
export const WALLPAPER_ACCEPT = [
  ...new Set([...Object.values(IMAGE_TYPES), ...Object.values(LIVE_TYPES)]),
  ...Object.keys({ ...IMAGE_TYPES, ...LIVE_TYPES }).map((ext) => `.${ext}`),
].join(",")

export type WallpaperGateReason =
  /** Not an image or video StashWell can show. */
  | "unsupported"
  /** A video or GIF on Free. */
  | "pro-format"
  | "too-large"
  /** Every slot is in use - replace one, or (on Free) upgrade. */
  | "slots-full"

export type WallpaperGateResult =
  | { allowed: true }
  | { allowed: false; reason: WallpaperGateReason; message: string }

function formatMb(bytes: number): string {
  return `${Math.round(bytes / MB)} MB`
}

/**
 * The file's type - from the browser where it reports one, otherwise from the
 * extension (some systems leave `type` empty, e.g. for WebM).
 */
function typeOf(file: { name: string; type: string }): { mime: string; live: boolean } | null {
  const reported = file.type.toLowerCase()
  if (Object.values(IMAGE_TYPES).includes(reported)) return { mime: reported, live: false }
  if (Object.values(LIVE_TYPES).includes(reported)) return { mime: reported, live: true }
  const extension = file.name.toLowerCase().split(".").pop() ?? ""
  if (IMAGE_TYPES[extension]) return { mime: IMAGE_TYPES[extension], live: false }
  if (LIVE_TYPES[extension]) return { mime: LIVE_TYPES[extension], live: true }
  return null
}

/**
 * Whether `file` can be added as a new upload, given how many are stored
 * already. Checked in order: the format, the plan's formats, the size, and
 * only then free slots - a file that couldn't be used anyway shouldn't offer
 * to replace the current wallpaper.
 */
export function canUploadWallpaper(
  isPro: boolean,
  currentUploadCount: number,
  file: { name: string; type: string; size: number }
): WallpaperGateResult {
  const limits = isPro ? WALLPAPER_LIMITS.pro : WALLPAPER_LIMITS.free
  const type = typeOf(file)

  if (!type) {
    return {
      allowed: false,
      reason: "unsupported",
      message: isPro
        ? "Use a JPG, PNG, WebP or GIF image, or an MP4 or WebM video."
        : "Use a JPG, PNG or WebP image.",
    }
  }
  if (type.live && !isPro) {
    return {
      allowed: false,
      reason: "pro-format",
      message: "Video and GIF wallpapers are part of StashWell Pro.",
    }
  }
  if (file.size > limits.maxBytes) {
    return {
      allowed: false,
      reason: "too-large",
      message: isPro
        ? `That file is over ${formatMb(limits.maxBytes)}. Try a smaller one.`
        : `Free uploads can be up to ${formatMb(limits.maxBytes)} - Pro allows up to ${formatMb(WALLPAPER_LIMITS.pro.maxBytes)}.`,
    }
  }
  if (currentUploadCount >= limits.slots) {
    return {
      allowed: false,
      reason: "slots-full",
      message: isPro
        ? `All ${limits.slots} upload slots are in use.`
        : "Free includes one custom wallpaper, and it's in use.",
    }
  }
  return { allowed: true }
}

/** Whether `file` may replace an existing upload: the same checks, minus slots. */
export function canReplaceWallpaper(
  isPro: boolean,
  file: { name: string; type: string; size: number }
): WallpaperGateResult {
  return canUploadWallpaper(isPro, 0, file)
}

/**
 * "1/1 custom upload slot used", "3/10 custom upload slots used". Uploads added
 * before these limits existed are kept, so a count can be over the limit.
 */
export function describeSlotUsage(isPro: boolean, count: number): string {
  const slots = isPro ? WALLPAPER_LIMITS.pro.slots : WALLPAPER_LIMITS.free.slots
  if (count > slots) {
    return `${count} uploads kept - ${isPro ? "Pro" : "Free"} includes ${slots} ${slots === 1 ? "slot" : "slots"}`
  }
  return `${count}/${slots} custom upload ${slots === 1 ? "slot" : "slots"} used`
}

/** Whether `file` is a video, going by its extension when the browser reports no type. */
export function isVideoFile(file: { name: string; type: string }): boolean {
  if (file.type) return file.type.startsWith("video/")
  const extension = file.name.toLowerCase().split(".").pop() ?? ""
  return extension === "mp4" || extension === "webm"
}
