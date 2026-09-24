"use client"

import * as React from "react"

import { localDayKey } from "@/lib/dates"
import {
  type CardFeel,
  DEFAULT_CARD_FEEL,
  applyCardFeel,
  readCardFeel,
} from "@/lib/card-feel"
/**
 * Purely local - wallpaper/appearance settings never sync to Supabase, so
 * this key lives here instead of lib/syncEngine.ts. Kept identical to the
 * window.localStorage key this used before moving to chrome.storage.local,
 * so an existing local value migrates in place instead of appearing to
 * reset.
 */
const SETTINGS_STORAGE_KEY = "bm:appearance"

export type BackgroundColorMode =
  | "molten"
  | "ember"
  | "frost"
  | "colorbends"
  | "lightrays"
  | "softaurora"
  | "mist"
  | "custom"

export interface AppearanceSettings extends CardFeel {
  colorMode: BackgroundColorMode
  backgroundEnabled: boolean
  cursorGlowEnabled: boolean
  customBackgroundId: string | null
  greetingName: string
  greetingEnabled: boolean
  searchBarEnabled: boolean
  notesEnabled: boolean
  remindersEnabled: boolean
  dailyWallpaperEnabled: boolean
  /** Local calendar day (YYYY-MM-DD) the wallpaper last rotated on. */
  lastWallpaperRotation: string | null
}

// Re-exported so existing import sites keep working; the implementation moved
// to lib/dates.ts so pure lib/ modules can use it too.
export { localDayKey }

const DEFAULT_SETTINGS: AppearanceSettings = {
  ...DEFAULT_CARD_FEEL,
  colorMode: "molten",
  backgroundEnabled: true,
  cursorGlowEnabled: true,
  customBackgroundId: null,
  greetingName: "Srush",
  greetingEnabled: true,
  searchBarEnabled: true,
  notesEnabled: true,
  remindersEnabled: true,
  dailyWallpaperEnabled: false,
  lastWallpaperRotation: null,
}

function hasChromeStorage(): boolean {
  return typeof chrome !== "undefined" && !!chrome.storage?.local
}

function mergeSettings(raw: unknown): AppearanceSettings {
  const merged = { ...DEFAULT_SETTINGS, ...(raw as object) }
  // Clamp/fill the slider values, so a partial or hand-edited blob can't put
  // NaN into a CSS variable and blank every card.
  return { ...merged, ...readCardFeel(merged) }
}

/**
 * Reads the stored settings from chrome.storage.local - the extension-wide
 * store that (unlike window.localStorage) is shared between the popup and
 * dashboard contexts. Purely local: these settings never sync to Supabase,
 * so this is the only place they're written or read. Falls back to
 * window.localStorage outside the extension (e.g. `next dev` in a plain
 * browser tab), and one-time migrates an existing localStorage value into
 * chrome.storage.local the first time it finds one.
 */
async function readStoredSettings(): Promise<AppearanceSettings> {
  try {
    if (hasChromeStorage()) {
      const stored = await chrome.storage.local.get(SETTINGS_STORAGE_KEY)
      const raw = stored[SETTINGS_STORAGE_KEY]
      if (raw != null) return mergeSettings(raw)

      const legacy = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
      if (legacy) {
        const migrated = mergeSettings(JSON.parse(legacy))
        await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: migrated })
        window.localStorage.removeItem(SETTINGS_STORAGE_KEY)
        return migrated
      }
      return DEFAULT_SETTINGS
    }

    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    return mergeSettings(JSON.parse(raw))
  } catch {
    return DEFAULT_SETTINGS
  }
}

function writeStoredSettings(settings: AppearanceSettings) {
  try {
    if (hasChromeStorage()) {
      void chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: settings })
    } else {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
    }
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
  setNotesEnabled: (enabled: boolean) => void
  setRemindersEnabled: (enabled: boolean) => void
  setDailyWallpaperEnabled: (enabled: boolean) => void
  setCardFeel: (patch: Partial<CardFeel>) => void
  resetCardFeel: () => void
  resetAppearance: () => void
  applyDailyWallpaper: (pick: {
    colorMode: BackgroundColorMode
    customBackgroundId: string | null
    date: string
  }) => void
} {
  // Starts at defaults and loads for real in the effect below - reading
  // chrome.storage.local is async, unlike the window.localStorage this used
  // to read synchronously here, so there's a first-paint flash of defaults
  // (same tradeoff as the custom-background list elsewhere in this app).
  const [settings, setSettings] = React.useState<AppearanceSettings>(
    DEFAULT_SETTINGS
  )

  React.useEffect(() => {
    let active = true
    readStoredSettings().then((loaded) => {
      if (active) setSettings(loaded)
    })
    return () => {
      active = false
    }
  }, [])

  // Picks up settings written elsewhere, e.g. the popup context.
  React.useEffect(() => {
    if (!hasChromeStorage()) return
    function handleChange(
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: chrome.storage.AreaName
    ) {
      if (areaName !== "local") return
      const change = changes[SETTINGS_STORAGE_KEY]
      if (!change) return
      setSettings(mergeSettings(change.newValue))
    }
    chrome.storage.onChanged.addListener(handleChange)
    return () => chrome.storage.onChanged.removeListener(handleChange)
  }, [])

  const update = React.useCallback((patch: Partial<AppearanceSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch }
      writeStoredSettings(next)
      return next
    })
  }, [])

  // Stable identity: the rotation hook calls this from an effect.
  const applyDailyWallpaper = React.useCallback(
    (pick: {
      colorMode: BackgroundColorMode
      customBackgroundId: string | null
      date: string
    }) => {
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

  // Cards read their radius, blur, opacity and so on from CSS variables on
  // <html>, so one write here restyles every card with no re-render.
  React.useEffect(() => {
    applyCardFeel(settings)
  }, [settings])

  return {
    applyDailyWallpaper,
    settings,
    setCardFeel: (patch) => update(patch),
    resetCardFeel: () => update(DEFAULT_CARD_FEEL),
    // Only the Appearance section's own settings: greetingName, greetingEnabled
    // and searchBarEnabled live under General, and resetting the wallpaper must
    // not wipe the name the user typed there.
    resetAppearance: () =>
      update({
        ...DEFAULT_CARD_FEEL,
        colorMode: DEFAULT_SETTINGS.colorMode,
        backgroundEnabled: DEFAULT_SETTINGS.backgroundEnabled,
        cursorGlowEnabled: DEFAULT_SETTINGS.cursorGlowEnabled,
        customBackgroundId: DEFAULT_SETTINGS.customBackgroundId,
        dailyWallpaperEnabled: DEFAULT_SETTINGS.dailyWallpaperEnabled,
        lastWallpaperRotation: DEFAULT_SETTINGS.lastWallpaperRotation,
      }),
    // backgroundEnabled is the master switch for every background, uploads
    // included, so picking any wallpaper turns it back on.
    setColorMode: (mode) =>
      update({ colorMode: mode, backgroundEnabled: true }),
    setBackgroundEnabled: (enabled) => update({ backgroundEnabled: enabled }),
    setCursorGlowEnabled: (enabled) => update({ cursorGlowEnabled: enabled }),
    setCustomBackgroundId: (id) => update({ customBackgroundId: id }),
    setGreetingName: (name) => update({ greetingName: name }),
    setGreetingEnabled: (enabled) => update({ greetingEnabled: enabled }),
    setSearchBarEnabled: (enabled) => update({ searchBarEnabled: enabled }),
    setNotesEnabled: (enabled) => update({ notesEnabled: enabled }),
    setRemindersEnabled: (enabled) => update({ remindersEnabled: enabled }),
    setDailyWallpaperEnabled: (enabled) =>
      // Stamping today on enable means the first rotation happens at the next
      // midnight, not the instant the switch is flipped.
      update({
        dailyWallpaperEnabled: enabled,
        lastWallpaperRotation: enabled ? localDayKey() : null,
      }),
  }
}
