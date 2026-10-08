"use client"

import * as React from "react"

import { useAuth } from "@/lib/auth-context"
import { isProUser, readStoredIsPro, subscribeStoredIsPro } from "@/lib/pro-status"

/**
 * No billing system exists yet - this reads a metadata field nothing
 * currently sets, so it's false (and upgrade CTAs show) for every real user
 * today. Flipping it true (e.g. once Stripe webhooks land) is what unlocks
 * Pro features.
 *
 * Strict on purpose: signed out (Local Mode) is never Pro, and only a literal
 * `true` counts - see lib/pro-status.ts's isProUser.
 */
export function useIsPro(): boolean {
  const { user } = useAuth()
  return isProUser(user)
}

/**
 * The same answer for views with no AuthProvider - the Kanban window and the
 * overlay panel content.js shows on every site - read from the session the
 * dashboard saved. Null until that read lands, so a Pro user never sees a
 * flash of the locked state.
 */
export function useStoredIsPro(): boolean | null {
  const [isPro, setIsPro] = React.useState<boolean | null>(null)

  React.useEffect(() => {
    let active = true
    const refresh = () => {
      readStoredIsPro().then((next) => {
        if (active) setIsPro(next)
      })
    }
    refresh()
    const unsubscribe = subscribeStoredIsPro(refresh)
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  return isPro
}
