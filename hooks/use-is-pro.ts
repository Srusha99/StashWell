"use client"

import { useAuth } from "@/lib/auth-context"

/**
 * No billing system exists yet - this reads a metadata field nothing
 * currently sets, so it's false (and upgrade CTAs show) for every real user
 * today. Flipping it true (e.g. once Stripe webhooks land) is what unlocks
 * Pro features.
 *
 * Strict on purpose: signed out (Local Mode) is never Pro, and only a literal
 * `true` counts - a missing, malformed or truthy-but-not-true value is Free.
 */
export function useIsPro(): boolean {
  const { user } = useAuth()
  if (!user) return false
  const metadata = user.user_metadata as { isPro?: unknown } | undefined
  return metadata?.isPro === true
}
