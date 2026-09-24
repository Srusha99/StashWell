/**
 * Syncs tab session bundles between chrome.storage.local and the
 * `user_profiles` table in Supabase.
 *
 * Local-first: every write goes to chrome.storage.local first, synchronously
 * with the user's action, so the UI never waits on the network. The Supabase
 * upsert is fired afterwards, in the background - callers don't await it.
 *
 * Wallpaper/appearance settings (hooks/use-appearance-settings.ts) are
 * deliberately out of scope here - they stay purely local in
 * chrome.storage.local and never touch this sync engine or Supabase.
 *
 * Storage keys are duplicated here rather than imported from
 * lib/session-bundles.ts to avoid a module cycle (that file calls
 * pushToCloud after every local write) - same tradeoff already made for
 * public/background.js, see that file's header comment.
 */

import { supabase } from "@/lib/supabaseClient"

const SESSIONS_STORAGE_KEY = "stashwell_sessions"

interface UserProfileRow {
  saved_sessions: unknown
}

function hasStorageApi(): boolean {
  return typeof chrome !== "undefined" && !!chrome.storage?.local
}

/**
 * Reads this user's `saved_sessions` from `user_profiles` and writes it into
 * chrome.storage.local, overwriting local state. Call on mount once a
 * session is found (restored or freshly signed in) - see
 * lib/auth-context.tsx.
 */
export async function pullFromCloud(userId: string): Promise<void> {
  if (!hasStorageApi()) return

  const { data, error } = await supabase
    .from("user_profiles")
    .select("saved_sessions")
    .eq("user_id", userId)
    .maybeSingle<UserProfileRow>()

  if (error) {
    console.warn("syncEngine.pullFromCloud failed:", error.message)
    return
  }
  if (!data || data.saved_sessions == null) return

  await chrome.storage.local.set({
    [SESSIONS_STORAGE_KEY]: data.saved_sessions,
  })
}

/**
 * Upserts the given sessions into this user's `user_profiles` row.
 * Fire-and-forget: callers write to chrome.storage.local first, then call
 * this without awaiting it, so a slow or failed network call never blocks
 * the local save.
 */
export function pushToCloud(changes: { sessions?: unknown }): void {
  void pushToCloudAsync(changes)
}

async function pushToCloudAsync(changes: {
  sessions?: unknown
}): Promise<void> {
  if (changes.sessions === undefined) return

  const { data, error: sessionError } = await supabase.auth.getSession()
  const user = data.session?.user
  if (sessionError || !user) return

  const { error } = await supabase
    .from("user_profiles")
    .upsert({ user_id: user.id, saved_sessions: changes.sessions }, { onConflict: "user_id" })
  if (error) {
    console.warn("syncEngine.pushToCloud failed:", error.message)
  }
}
