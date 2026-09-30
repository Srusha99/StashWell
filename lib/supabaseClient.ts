import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Supabase defaults to localStorage, which isn't reliably shared between the
// extension's popup and dashboard contexts and doesn't survive them closing.
// chrome.storage.local is the extension-wide store that does.
//
// The try/catch in each method is a backstop for a page that outlives an
// extension reload/update: the first chrome.* call after that throws
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

// The docked overlay iframe public/content.js keeps loaded on every web page
// (index.html?view=kanban-panel) never uses Supabase - it only renders the
// Kanban board, whose calendar sync signs in through chrome.identity instead
// (see lib/gcal-service.ts) - but this module still loads there because every
// view shares one bundle. On defaults, each of those iframes would read and
// refresh the session from chrome.storage on every tab switch (Supabase
// always installs a visibilitychange handler in a browser), and those
// iframes are exactly the pages that outlive an extension reload. An
// in-memory, never-refreshed session there means it never touches storage.
const isOverlayPanel =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('view') === 'kanban-panel'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: chromeStorageAdapter,
    persistSession: !isOverlayPanel,
    autoRefreshToken: !isOverlayPanel,
  },
})
