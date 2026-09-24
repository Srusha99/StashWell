"use client"

import * as React from "react"
import { Bookmark, Eye, EyeOff } from "lucide-react"

import { supabase } from "@/lib/supabaseClient"
import { signInWithGoogle } from "@/lib/googleAuth"

export function AuthForm() {
  const [mode, setMode] = React.useState<"sign-in" | "sign-up">("sign-in")
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [showPassword, setShowPassword] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [message, setMessage] = React.useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setMessage(null)
    setLoading(true)

    const { error } =
      mode === "sign-in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password })

    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    if (mode === "sign-up") {
      setMessage("Check your email to confirm your account.")
    }
  }

  async function handleGoogleSignIn() {
    setError(null)
    setMessage(null)
    setLoading(true)

    const { error } = await signInWithGoogle()

    setLoading(false)
    if (error) setError(error)
  }

  async function handleForgotPassword() {
    setError(null)
    setMessage(null)

    if (!email) {
      setError("Enter your email above first.")
      return
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email)
    if (error) {
      setError(error.message)
      return
    }
    setMessage("Check your email for a reset link.")
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-gradient-to-br from-blue-50 via-slate-50 to-sky-50 p-4">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-blue-100/60 bg-white shadow-xl">
        <div className="pointer-events-none absolute top-0 right-0 left-0 -mt-20 h-48 bg-gradient-to-b from-blue-100 via-blue-50 to-transparent opacity-70 blur-3xl" />

        <div className="relative p-8">
          <div className="mb-8 flex flex-col items-center">
            <div className="mb-6 -rotate-3 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 p-4 shadow-lg shadow-blue-200/60 transition-transform hover:rotate-3">
              <Bookmark className="size-9 text-white" strokeWidth={2.2} />
            </div>
            <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900">
              {mode === "sign-in" ? "Welcome back" : "Create your account"}
            </h2>
            <p className="mt-1.5 text-center text-sm text-slate-500">
              Your bookmarks, finally worth coming back to.
            </p>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 shadow-sm transition-all duration-200 hover:bg-slate-50 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
          >
            <svg viewBox="0 0 24 24" className="size-4.5" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v2.98h3.86c2.26-2.08 3.56-5.14 3.56-8.8z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.93l-3.86-2.98c-1.07.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.24v3.09C3.21 21.3 7.24 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.27 14.28A7.14 7.14 0 0 1 4.9 12c0-.79.14-1.56.37-2.28V6.63H1.24A11.94 11.94 0 0 0 0 12c0 1.94.46 3.77 1.24 5.37l4.03-3.09z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.94 1.19 15.24 0 12 0 7.24 0 3.21 2.7 1.24 6.63l4.03 3.09C6.22 6.86 8.87 4.75 12 4.75z"
              />
            </svg>
            Continue with Google
          </button>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-medium text-slate-400">or</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-900 placeholder:text-slate-400 transition-all outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/15"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700">
                  Password
                </label>
                {mode === "sign-in" && (
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-xs font-medium text-blue-700 hover:text-blue-800 hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={6}
                  autoComplete={
                    mode === "sign-in" ? "current-password" : "new-password"
                  }
                  placeholder="••••••••"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pr-12 pl-3.5 text-sm text-slate-900 placeholder:text-slate-400 transition-all outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/15"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-2 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}
            {message && <p className="text-xs text-slate-500">{message}</p>}

            <button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-xl bg-gradient-to-b from-blue-500 to-blue-700 text-sm font-semibold text-white shadow-md transition-all duration-200 hover:from-blue-600 hover:to-blue-800 hover:shadow-lg hover:shadow-blue-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
            >
              {loading
                ? "Please wait…"
                : mode === "sign-in"
                  ? "Log in"
                  : "Sign up"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            {mode === "sign-in" ? "New to Stashwell?" : "Already have an account?"}{" "}
            <button
              type="button"
              onClick={() =>
                setMode((current) =>
                  current === "sign-in" ? "sign-up" : "sign-in"
                )
              }
              className="font-semibold text-blue-700 hover:text-blue-800 hover:underline"
            >
              {mode === "sign-in" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
