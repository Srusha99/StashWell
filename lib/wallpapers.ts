/**
 * Display data for the built-in backgrounds: what Settings shows on each
 * wallpaper tile.
 *
 * The real backgrounds are WebGL canvases (or, for "mist", a video), far too
 * expensive to run six at once inside a dialog. Each tile therefore renders a
 * cheap stand-in built from the same colours the live component is configured
 * with in bookmark-app.tsx - keep the two in step when a background is retuned.
 */

import type { BackgroundColorMode } from "@/hooks/use-appearance-settings"

export interface WallpaperPreset {
  id: BackgroundColorMode
  label: string
  /** A CSS `background` value for the tile, or a video to loop in it. */
  preview: { kind: "css"; value: string } | { kind: "video"; src: string }
}

/**
 * In the same order as ROTATING_BUILT_INS, so the grid reads in the order the
 * daily rotation walks through. "ember" and "frost" are legacy MoltenMetal
 * colour variants rather than pickable wallpapers, so they are left out here too.
 */
export const WALLPAPER_PRESETS: WallpaperPreset[] = [
  {
    id: "molten",
    label: "Molten",
    preview: {
      kind: "css",
      value:
        "radial-gradient(120% 120% at 25% 15%, #ffffff 0%, #334abc 38%, #362287 75%, #120b2e 100%)",
    },
  },
  {
    id: "colorbends",
    label: "Color Bends",
    preview: {
      kind: "css",
      value: "linear-gradient(115deg, #5227ff 0%, #151be3 45%, #0d5fe6 100%)",
    },
  },
  {
    id: "lightrays",
    label: "Light Rays",
    preview: {
      kind: "css",
      value:
        "radial-gradient(90% 130% at 50% -20%, #a78bfa 0%, #5227ff 35%, #0b0616 100%)",
    },
  },
  {
    id: "softaurora",
    label: "Soft Aurora",
    preview: {
      kind: "css",
      value: "linear-gradient(160deg, #f7f7f7 0%, #e9c7ff 45%, #e100ff 100%)",
    },
  },
  {
    id: "mist",
    label: "Misty Pines",
    preview: { kind: "video", src: "/backgrounds/mist-over-the-pines.mp4" },
  },
]

export function wallpaperLabel(mode: BackgroundColorMode): string {
  return (
    WALLPAPER_PRESETS.find((preset) => preset.id === mode)?.label ?? "Wallpaper"
  )
}
