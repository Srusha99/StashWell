"use client"

import * as React from "react"
import type { User } from "@supabase/supabase-js"

import { readStoredSessionUser, supabase } from "@/lib/supabaseClient"

interface AuthContextValue {
  user: User | null
  /** True until it's known who's signed in - normally a few milliseconds. */
  loading: boolean
  /**
   * Whether Supabase itself has confirmed `user`, rather than it being read
   * from the saved session. Anything that talks to the account on the
   * user's behalf (syncing) waits for this; anything that only shows who's
   * signed in doesn't need to.
   */
  confirmed: boolean
}

const AuthContext = React.createContext<AuthContextValue | undefined>(
  undefined
)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [confirmed, setConfirmed] = React.useState(false)

  // Syncing the signed-in user's dashboard is useDashboardSync's job
  // (hooks/use-dashboard-sync.ts) - it starts on its own once there's a
  // confirmed user, whether the session was restored or just signed in.
  React.useEffect(() => {
    let answered = false

    function apply(nextUser: User | null) {
      answered = true
      setUser(nextUser)
      setLoading(false)
      setConfirmed(true)
    }

    // getSession() doesn't resolve until an expired access token - which it
    // is after an hour away - has been refreshed over the network, retrying
    // for up to half a minute when offline, and the dashboard waited on it
    // blank. The saved session already says who's signed in, so that's used
    // straight away; Supabase's own answer replaces it whenever it lands (a
    // revoked session still signs out, just as before).
    readStoredSessionUser().then((stored) => {
      if (answered) return
      setUser(stored)
      setLoading(false)
    })

    supabase.auth.getSession().then(({ data: { session } }) => {
      apply(session?.user ?? null)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        apply(session?.user ?? null)
      }
    )

    return () => {
      subscription.subscription.unsubscribe()
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, confirmed }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = React.useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
