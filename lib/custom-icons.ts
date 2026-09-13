const PREFIX = "bm:icon:"
const ICON_SIZE = 64

export function getCustomIcon(id: string): string | null {
  try {
    return window.localStorage.getItem(PREFIX + id)
  } catch {
    return null
  }
}

export function setCustomIcon(id: string, dataUrl: string): void {
  try {
    window.localStorage.setItem(PREFIX + id, dataUrl)
  } catch {
    // ignore write failures (e.g. storage disabled or quota exceeded)
  }
}

export function clearCustomIcon(id: string): void {
  try {
    window.localStorage.removeItem(PREFIX + id)
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
