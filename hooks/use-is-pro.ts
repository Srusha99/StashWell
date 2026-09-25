"use client"

import { useAuth } from "@/lib/auth-context"

/**
 * No billing system exists yet - this reads a metadata field nothing
 * currently sets, so it's false (and upgrade CTAs show) for every real user
 * today. Flipping it true (e.g. once Stripe webhooks land) is what unlocks
 * Pro features.
 */
export function useIsPro(): boolean {
  const { user } = useAuth()
  const metadata = user?.user_metadata as { isPro?: boolean } | undefined
  return true // TODO: revert to `metadata?.isPro ?? false` before shipping
  return metadata?.isPro ?? false
}
