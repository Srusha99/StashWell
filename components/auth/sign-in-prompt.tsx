"use client"

import * as React from "react"
import { X } from "lucide-react"

import { AuthForm } from "@/components/auth/auth-form"
import { useAuth } from "@/lib/auth-context"

const SignInPromptContext = React.createContext<() => void>(() => {})

/**
 * The dashboard works signed out ("Local Mode" - everything stays on this
 * device), so signing in is something opened on demand - from the sync pill or
 * the account menu - rather than a gate in front of everything. It closes by
 * itself once a sign-in succeeds.
 */
export function SignInPromptProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [open, setOpen] = React.useState(false)
  const openPrompt = React.useCallback(() => setOpen(true), [])

  // Signed in: done. Reset rather than just hidden, so signing out later
  // doesn't bring the form straight back.
  if (open && user) setOpen(false)
  const visible = open && !user

  React.useEffect(() => {
    if (!visible) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [visible])

  return (
    <SignInPromptContext.Provider value={openPrompt}>
      {children}
      {visible && (
        <div role="dialog" aria-modal="true" aria-label="Sign in" className="fixed inset-0 z-[60]">
          <AuthForm />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="fixed top-4 right-4 flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50"
          >
            <X className="size-3.5" aria-hidden />
            Keep using Local Mode
          </button>
        </div>
      )}
    </SignInPromptContext.Provider>
  )
}

/** Opens the sign-in form over the dashboard. */
export function useSignInPrompt(): () => void {
  return React.useContext(SignInPromptContext)
}
