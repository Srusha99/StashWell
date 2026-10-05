/**
 * Appearance settings sync: the Appearance panel's settings
 * (hooks/use-appearance-settings.ts), stored in `user_dashboards.settings`.
 *
 * Each field is its own unit (merged by mergeSettings in
 * lib/dashboard-sync-merge.ts), so changing the wallpaper on one PC and the
 * greeting on another keeps both.
 *
 * Uploaded backgrounds stay on the device they were added on - they live in
 * that device's IndexedDB, so another device has nothing to show for them. A
 * device showing one of its own uploads keeps it: it neither sends "custom"
 * as its wallpaper nor takes another device's wallpaper over it, until the
 * user picks a built-in one there.
 */

import {
  type AppearanceSettings,
  type BackgroundColorMode,
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE_SETTINGS,
} from "@/hooks/use-appearance-settings"
import { CARD_FEEL_KEYS } from "@/lib/card-feel"
import { hashValue, stableStringify } from "@/lib/dashboard-sync-merge"

const SYNCED_FIELDS = [
  "colorMode",
  "backgroundEnabled",
  "cursorGlowEnabled",
  "greetingName",
  "greetingEnabled",
  "searchBarEnabled",
  "use24HourClock",
  "dailyWallpaperEnabled",
  // Synced so that once one device has rotated today's wallpaper, the others
  // take its pick instead of each rotating on their own.
  "lastWallpaperRotation",
  "bookmarkTextScale",
  ...CARD_FEEL_KEYS,
] as const satisfies readonly (keyof AppearanceSettings)[]

type SyncedField = (typeof SYNCED_FIELDS)[number]

/** Every built-in wallpaper - all of BackgroundColorMode except "custom". */
const BUILT_IN_MODES = [
  "molten",
  "ember",
  "frost",
  "colorbends",
  "lightrays",
  "softaurora",
  "mist",
] as const satisfies readonly Exclude<BackgroundColorMode, "custom">[]

export type AppearanceUnits = Partial<Record<SyncedField, unknown>>

export interface LocalAppearance {
  /** As stored, so a write can tell if it changed since. */
  raw: unknown
  settings: AppearanceSettings
  units: AppearanceUnits
}

function isValid(field: SyncedField, value: unknown): boolean {
  if (field === "colorMode") return (BUILT_IN_MODES as readonly unknown[]).includes(value)
  if (field === "lastWallpaperRotation") return value === null || typeof value === "string"
  if (typeof value === "number") return Number.isFinite(value)
  return typeof value === typeof DEFAULT_APPEARANCE_SETTINGS[field]
}

export async function readLocalAppearance(): Promise<LocalAppearance> {
  const stored = await chrome.storage.local.get(APPEARANCE_STORAGE_KEY)
  const raw: unknown = stored?.[APPEARANCE_STORAGE_KEY]
  const settings: AppearanceSettings = {
    ...DEFAULT_APPEARANCE_SETTINGS,
    ...(raw && typeof raw === "object" ? raw : {}),
  }
  const units: AppearanceUnits = {}
  for (const field of SYNCED_FIELDS) {
    if (field === "colorMode" && settings.colorMode === "custom") continue
    if (isValid(field, settings[field])) units[field] = settings[field]
  }
  return { raw, settings, units }
}

/** The valid fields in a cloud row, or null if it has none. */
export function parseAppearance(raw: unknown): AppearanceUnits | null {
  if (!raw || typeof raw !== "object") return null
  const units: AppearanceUnits = {}
  for (const field of SYNCED_FIELDS) {
    const value = (raw as Record<string, unknown>)[field]
    if (value !== undefined && isValid(field, value)) units[field] = value
  }
  return units
}

/**
 * Stores the merged settings on this device - only over what was read at the
 * start of this sync. Returns false if they changed since, and nothing was
 * written.
 */
export async function applyAppearance(merged: AppearanceUnits, local: LocalAppearance): Promise<boolean> {
  const changes: Partial<AppearanceSettings> = {}
  for (const field of SYNCED_FIELDS) {
    const value = merged[field]
    if (value === undefined || hashValue(value) === hashValue(local.units[field])) continue
    if (field === "colorMode" && local.settings.colorMode === "custom") continue
    Object.assign(changes, { [field]: value })
  }
  if (Object.keys(changes).length === 0) return true

  const latest = await chrome.storage.local.get(APPEARANCE_STORAGE_KEY)
  if (stableStringify(latest?.[APPEARANCE_STORAGE_KEY]) !== stableStringify(local.raw)) return false
  // hooks/use-appearance-settings.ts picks this up through storage.onChanged.
  await chrome.storage.local.set({ [APPEARANCE_STORAGE_KEY]: { ...local.settings, ...changes } })
  return true
}
