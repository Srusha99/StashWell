"use client"

import * as React from "react"

export type BackgroundColorMode = "molten" | "ember" | "frost" | "colorbends" | "webthreads" | "lightrays" | "softaurora" | "custom"

export interface AppearanceSettings {
  colorMode: BackgroundColorMode
  backgroundEnabled: boolean
  cursorGlowEnabled: boolean
  customBackgroundId: string | null
  greetingName: string
  greetingEnabled: boolean
  searchBarEnabled: boolean
}

const STORAGE_KEY = "bm:appearance"

const DEFAULT_SETTINGS: AppearanceSettings = {
  colorMode: "molten",
  backgroundEnabled: true,
  cursorGlowEnabled: true,
  customBackgroundId: null,
  greetingName: "Srush",
  greetingEnabled: true,
  searchBarEnabled: true,
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
} {
  const [settings, setSettings] = React.useState<AppearanceSettings>(() => readStoredSettings())

  const update = React.useCallback((patch: Partial<AppearanceSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch }
      writeStoredSettings(next)
      return next
    })
  }, [])

  return {
    settings,
    setColorMode: (mode) => update(mode === "custom" ? { colorMode: mode } : { colorMode: mode, backgroundEnabled: true }),
    setBackgroundEnabled: (enabled) => update({ backgroundEnabled: enabled }),
    setCursorGlowEnabled: (enabled) => update({ cursorGlowEnabled: enabled }),
    setCustomBackgroundId: (id) => update({ customBackgroundId: id }),
    setGreetingName: (name) => update({ greetingName: name }),
    setGreetingEnabled: (enabled) => update({ greetingEnabled: enabled }),
    setSearchBarEnabled: (enabled) => update({ searchBarEnabled: enabled }),
  }
}
