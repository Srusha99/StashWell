"use client"

import * as React from "react"

export type BackgroundColorMode = "molten" | "ember" | "frost" | "colorbends" | "webthreads" | "lightrays" | "softaurora" | "mist" | "custom"

export interface AppearanceSettings {
  colorMode: BackgroundColorMode
  backgroundEnabled: boolean
  cursorGlowEnabled: boolean
  customBackgroundId: string | null
  greetingName: string
  greetingEnabled: boolean
  searchBarEnabled: boolean
  dailyWallpaperEnabled: boolean
  /** Local calendar day (YYYY-MM-DD) the wallpaper last rotated on. */
  lastWallpaperRotation: string | null
}

const STORAGE_KEY = "bm:appearance"

/**
 * Local calendar day as YYYY-MM-DD. Built from local getters rather than
 * toISOString(), which converts to UTC and would roll the day over at the
 * wrong moment for anyone not on UTC.
 */
export function localDayKey(date: Date = new Date()): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

const DEFAULT_SETTINGS: AppearanceSettings = {
  colorMode: "molten",
  backgroundEnabled: true,
  cursorGlowEnabled: true,
  customBackgroundId: null,
  greetingName: "Srush",
  greetingEnabled: true,
  searchBarEnabled: true,
  dailyWallpaperEnabled: false,
  lastWallpaperRotation: null,
}

function readStoredSettings(): AppearanceSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_SETTINGS, ...parsed }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function writeStoredSettings(settings: AppearanceSettings) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // ignore write failures (e.g. storage disabled)
  }
}

export function useAppearanceSettings(): {
  settings: AppearanceSettings
  setColorMode: (mode: BackgroundColorMode) => void
  setBackgroundEnabled: (enabled: boolean) => void
  setCursorGlowEnabled: (enabled: boolean) => void
  setCustomBackgroundId: (id: string | null) => void
  setGreetingName: (name: string) => void
  setGreetingEnabled: (enabled: boolean) => void
  setSearchBarEnabled: (enabled: boolean) => void
  setDailyWallpaperEnabled: (enabled: boolean) => void
  applyDailyWallpaper: (pick: {
    colorMode: BackgroundColorMode
    customBackgroundId: string | null
    date: string
  }) => void
} {
  const [settings, setSettings] = React.useState<AppearanceSettings>(() => readStoredSettings())

  const update = React.useCallback((patch: Partial<AppearanceSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch }
      writeStoredSettings(next)
      return next
    })
  }, [])

  // Stable identity: the rotation hook calls this from an effect.
  const applyDailyWallpaper = React.useCallback(
    (pick: { colorMode: BackgroundColorMode; customBackgroundId: string | null; date: string }) => {
      // Deliberately leaves backgroundEnabled alone: if the user picked a plain
      // theme, midnight must not switch a wallpaper back on behind their back.
      update({
        colorMode: pick.colorMode,
        customBackgroundId: pick.customBackgroundId,
        lastWallpaperRotation: pick.date,
      })
    },
    [update]
  )

  return {
    applyDailyWallpaper,
    settings,
    // backgroundEnabled is the master switch for every background, uploads
    // included, so picking any wallpaper turns it back on.
    setColorMode: (mode) => update({ colorMode: mode, backgroundEnabled: true }),
    setBackgroundEnabled: (enabled) => update({ backgroundEnabled: enabled }),
    setCursorGlowEnabled: (enabled) => update({ cursorGlowEnabled: enabled }),
    setCustomBackgroundId: (id) => update({ customBackgroundId: id }),
    setGreetingName: (name) => update({ greetingName: name }),
    setGreetingEnabled: (enabled) => update({ greetingEnabled: enabled }),
    setSearchBarEnabled: (enabled) => update({ searchBarEnabled: enabled }),
    setDailyWallpaperEnabled: (enabled) =>
      // Stamping today on enable means the first rotation happens at the next
      // midnight, not the instant the switch is flipped.
      update({
        dailyWallpaperEnabled: enabled,
        lastWallpaperRotation: enabled ? localDayKey() : null,
      }),
  }
}
