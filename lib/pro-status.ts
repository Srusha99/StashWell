import { AUTH_STORAGE_KEY, readStoredSessionUser } from "@/lib/supabaseClient"

/**
 * The one rule for "is this account Pro", shared by hooks/use-is-pro.ts (the
 * dashboard) and useStoredIsPro below (the Kanban views outside it).
 *
 * Strict on purpose: no user (Local Mode) is never Pro, and only a literal
 * `true` counts - a missing, malformed or truthy-but-not-true value is Free.
 */
export function isProUser(user: { user_metadata?: unknown } | null | undefined): boolean {
  if (!user) return false
  const metadata = user.user_metadata as { isPro?: unknown } | undefined
  return metadata?.isPro === true
}

/**
 * Pro status from the session the dashboard saved, read straight from
 * chrome.storage.local. For the overlay Kanban panel, whose Supabase client
 * deliberately keeps no session of its own (lib/supabaseClient.ts), and the
 * Kanban window, which has no AuthProvider. Read-only: it never refreshes the
 * token - the dashboard does that and rewrites this key when it does.
 */
export async function readStoredIsPro(): Promise<boolean> {
  // An unreadable session reads as no user - locked rather than open.
  return isProUser(await readStoredSessionUser())
}

/** Calls `onChange` whenever the saved session changes (sign-in, sign-out, refresh). */
export function subscribeStoredIsPro(onChange: () => void): () => void {
  try {
    if (typeof chrome === "undefined" || !chrome.storage?.onChanged) return () => {}
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local" && AUTH_STORAGE_KEY in changes) onChange()
    }
    chrome.storage.onChanged.addListener(listener)
    return () => {
      try {
        chrome.storage.onChanged.removeListener(listener)
      } catch {
        // context invalidated - nothing left to remove from
      }
    }
  } catch {
    return () => {}
  }
}
