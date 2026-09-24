"use client"

import * as React from "react"
import type { User } from "@supabase/supabase-js"

import { supabase } from "@/lib/supabaseClient"
import { pullFromCloud } from "@/lib/syncEngine"

interface AuthContextValue {
  user: User | null
  loading: boolean
}

const AuthContext = React.createContext<AuthContextValue | undefined>(
  undefined
)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    // Sessions restored on mount (an existing, still-valid session) get
    // pulled just like a fresh sign-in - both mean "we now know who this
    // user is and haven't synced their cloud state into this session yet."
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
      if (session?.user) void pullFromCloud(session.user.id)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null)
        setLoading(false)
        if (event === "SIGNED_IN" && session?.user) {
          void pullFromCloud(session.user.id)
        }
      }
    )

    return () => {
      subscription.subscription.unsubscribe()
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading }}>
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
