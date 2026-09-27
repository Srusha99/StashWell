import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Supabase defaults to localStorage, which isn't reliably shared between the
// extension's popup and dashboard contexts and doesn't survive them closing.
// chrome.storage.local is the extension-wide store that does.
//
// This adapter also runs inside pages the docked-icon content script injects
// into (see public/content.js's kanban-panel iframe), which stay open across
// an extension reload/update. The first chrome.* call after that throws
// "Extension context invalidated" - including from Supabase's own periodic
// auto-refresh tick, which would otherwise repeat that throw on every tick
// forever until the page is reloaded. Failing quietly (session-not-found)
// instead of propagating keeps that from happening.
let warnedInvalidated = false
function warnInvalidated(error: unknown) {
  if (warnedInvalidated) return
  warnedInvalidated = true
  console.warn(
    '[StashWell] chrome.storage is unavailable (the extension was likely reloaded/updated while this page stayed open) - refresh the page to restore session sync.',
    error
  )
}

const chromeStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const result = await chrome.storage.local.get(key)
      return (result[key] as string | undefined) ?? null
    } catch (error) {
      warnInvalidated(error)
      return null
    }
  },
  setItem: async (key: string, value: string) => {
    try {
      await chrome.storage.local.set({ [key]: value })
    } catch (error) {
      warnInvalidated(error)
    }
  },
  removeItem: async (key: string) => {
    try {
      await chrome.storage.local.remove(key)
    } catch (error) {
      warnInvalidated(error)
    }
  },
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: chromeStorageAdapter,
    persistSession: true,
    autoRefreshToken: true,
  },
})
