"use client"

import * as React from "react"

import {
  localDayKey,
  type AppearanceSettings,
  type BackgroundColorMode,
} from "@/hooks/use-appearance-settings"

/**
 * Built-in themes that take part in the daily rotation, in display order.
 * "ember" and "frost" are legacy MoltenMetal colour variants rather than
 * separate themes, so they are left out.
 */
export const ROTATING_BUILT_INS: BackgroundColorMode[] = [
  "molten",
  "colorbends",
  "lightrays",
  "softaurora",
  "mist",
]

export interface WallpaperChoice {
  colorMode: BackgroundColorMode
  customBackgroundId: string | null
}

function buildPool(customBackgroundIds: string[]): WallpaperChoice[] {
  return [
    ...ROTATING_BUILT_INS.map((colorMode) => ({ colorMode, customBackgroundId: null })),
    ...customBackgroundIds.map((id) => ({
      colorMode: "custom" as BackgroundColorMode,
      customBackgroundId: id,
    })),
  ]
}

function millisecondsUntilNextMidnight(now: Date): number {
  const midnight = new Date(now)
  midnight.setHours(24, 0, 0, 0)
  return midnight.getTime() - now.getTime()
}

/**
 * Advances the background to the next entry in the pool once per local day
 * while `dailyWallpaperEnabled` is on.
 *
 * Stepping sequentially from whatever is currently applied (rather than picking
 * at random) guarantees a genuinely different wallpaper each day and cycles the
 * whole pool before repeating. A manual pick in Settings therefore also decides
 * where tomorrow's rotation continues from.
 */
export function useDailyWallpaper({
  settings,
  customBackgroundIds,
  customBackgroundsLoaded,
  applyDailyWallpaper,
}: {
  settings: AppearanceSettings
  customBackgroundIds: string[]
  customBackgroundsLoaded: boolean
  applyDailyWallpaper: (pick: WallpaperChoice & { date: string }) => void
}) {
  const {
    dailyWallpaperEnabled,
    backgroundEnabled,
    lastWallpaperRotation,
    colorMode,
    customBackgroundId,
  } = settings

  // Keyed on the joined ids so the effect below re-runs when uploads change
  // without depending on a fresh array identity every render.
  const poolKey = customBackgroundIds.join(",")

  const rotate = React.useCallback(() => {
    const today = localDayKey()
    if (lastWallpaperRotation === today) return

    const pool = buildPool(poolKey ? poolKey.split(",") : [])
    if (pool.length < 2) return

    const currentIndex = pool.findIndex(
      (entry) =>
        entry.colorMode === colorMode && entry.customBackgroundId === customBackgroundId
    )
    // An unknown current background (e.g. a since-deleted upload) starts the
    // cycle at the top of the pool instead of being treated as index -1.
    const next = pool[(currentIndex + 1) % pool.length]

    applyDailyWallpaper({ ...next, date: today })
  }, [lastWallpaperRotation, poolKey, colorMode, customBackgroundId, applyDailyWallpaper])

  React.useEffect(() => {
    // Uploads arrive asynchronously from IndexedDB; rotating before they land
    // would only ever pick from the built-ins. Backgrounds switched off means a
    // plain theme is in use, so there is nothing to rotate.
    if (!dailyWallpaperEnabled || !backgroundEnabled || !customBackgroundsLoaded) return

    rotate()

    // A New Tab page can stay open across midnight, so also rotate on a timer.
    // Re-checking on wake covers a suspended machine, where the timer fires late.
    let timer: number
    const scheduleNextMidnight = () => {
      timer = window.setTimeout(() => {
        rotate()
        scheduleNextMidnight()
      }, millisecondsUntilNextMidnight(new Date()) + 1000)
    }
    scheduleNextMidnight()

    const onVisible = () => {
      if (document.visibilityState === "visible") rotate()
    }
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      window.clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [dailyWallpaperEnabled, backgroundEnabled, customBackgroundsLoaded, rotate])
}
