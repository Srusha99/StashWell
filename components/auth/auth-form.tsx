"use client"

import * as React from "react"
import { Bookmark, Eye, EyeOff } from "lucide-react"

import { supabase } from "@/lib/supabaseClient"
import { signInWithGoogle } from "@/lib/googleAuth"
import { cn } from "@/lib/utils"

const INPUT_CLASS =
  "h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-900 placeholder:text-slate-400 transition-all outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/15"

/**
 * Optional "what kind of user are you" answer at sign-up, saved as
 * user_metadata.user_type. Nothing reads it yet - it's there for tailoring
 * the product later.
 */
const USER_TYPES = [
  { value: "student", label: "Student" },
  { value: "developer", label: "Developer" },
  { value: "video-editor", label: "Video editor" },
  { value: "other", label: "Other" },
] as const

type UserType = (typeof USER_TYPES)[number]["value"]

function PasswordInput({
  value,
  onChange,
  visible,
  onToggleVisible,
  autoComplete,
  invalid,
  id,
}: {
  value: string
  onChange: (value: string) => void
  visible: boolean
  onToggleVisible: () => void
  autoComplete: string
  invalid?: boolean
  id: string
}) {
  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
        minLength={6}
        autoComplete={autoComplete}
        placeholder="••••••••"
        aria-invalid={invalid || undefined}
        className={cn(
          INPUT_CLASS,
          "pr-12",
          invalid && "border-red-400 focus:border-red-500 focus:ring-red-500/15"
        )}
      />
      <button
        type="button"
        onClick={onToggleVisible}
        className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-2 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
        aria-label={visible ? "Hide password" : "Show password"}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}

export function AuthForm() {
  const [mode, setMode] = React.useState<"sign-in" | "sign-up">("sign-in")
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [confirmPassword, setConfirmPassword] = React.useState("")
  const [userType, setUserType] = React.useState<UserType | null>(null)
  // One toggle for both password fields, so revealing one never leaves the
  // other hidden while you compare them.
  const [showPassword, setShowPassword] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [message, setMessage] = React.useState<string | null>(null)
  // The address a confirmation email went to, for "Resend email".
  const [pendingConfirmation, setPendingConfirmation] = React.useState<string | null>(null)

  const isSignUp = mode === "sign-up"
  // Only flagged once something's been typed into the confirm field.
  const passwordsMismatch = isSignUp && confirmPassword.length > 0 && confirmPassword !== password

  function switchMode() {
    setMode((current) => (current === "sign-in" ? "sign-up" : "sign-in"))
    setError(null)
    setMessage(null)
    setPendingConfirmation(null)
    setConfirmPassword("")
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setMessage(null)
    setPendingConfirmation(null)

    if (isSignUp) {
      if (!name.trim()) {
        setError("Enter your name.")
        return
      }
      if (password !== confirmPassword) {
        // The confirm field is already showing "Passwords don't match".
        document.getElementById("auth-confirm-password")?.focus()
        return
      }
    }

    setLoading(true)

    const { data, error } = isSignUp
      ? await supabase.auth.signUp({
          email,
          password,
          options: {
            // full_name is the same key Google sign-in fills in, which is
            // what the avatar menu (components/auth/user-menu.tsx) shows.
            data: { full_name: name.trim(), ...(userType && { user_type: userType }) },
          },
        })
      : await supabase.auth.signInWithPassword({ email, password })

    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    if (!isSignUp) return

    // With "Confirm email" turned off in the Supabase project, sign-up
    // returns a session straight away and AuthProvider's onAuthStateChange
    // opens the dashboard - nothing more to show here.
    if (data.session) return

    // An email that already has an account (including one made with
    // Continue with Google) gets a stand-in user with no identities back,
    // no error, and no email - Supabase does that so sign-up can't be used to
    // find out which addresses are registered.
    if (data.user?.identities?.length === 0) {
      setError(
        "An account with this email already exists. Sign in instead - or use Continue with Google if that's how you created it."
      )
      return
    }

    setPendingConfirmation(email)
    setMessage(
      `We sent a confirmation link to ${email}. Open it to finish creating your account, then sign in here. Not there? Check your Spam folder.`
    )
  }

  async function handleResendConfirmation() {
    if (!pendingConfirmation) return
    setError(null)
    const { error } = await supabase.auth.resend({ type: "signup", email: pendingConfirmation })
    if (error) {
      setError(error.message)
      return
    }
    setMessage(`Sent another confirmation link to ${pendingConfirmation}.`)
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
    // Scrolls itself: globals.css locks html/body to overflow:hidden for the
    // full-bleed dashboard, and the sign-up form can be taller than a short
    // window. The card's m-auto (rather than justify-center) centers it when
    // it fits and lets it scroll from the top when it doesn't. color-scheme
    // is pinned to light because this page is light-only: under a dark theme
    // the native radio buttons otherwise render as filled dark dots.
    <div className="flex h-screen w-screen overflow-y-auto bg-gradient-to-br from-blue-50 via-slate-50 to-sky-50 p-4 [color-scheme:light]">
      <div className="relative m-auto w-full max-w-md overflow-hidden rounded-3xl border border-blue-100/60 bg-white shadow-xl">
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

          <form onSubmit={handleSubmit} className={isSignUp ? "space-y-4" : "space-y-5"}>
            {isSignUp && (
              <div className="space-y-1.5">
                <label htmlFor="auth-name" className="text-sm font-medium text-slate-700">
                  Name
                </label>
                <input
                  id="auth-name"
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  autoComplete="name"
                  placeholder="Your name"
                  className={INPUT_CLASS}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="auth-email" className="text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
                className={INPUT_CLASS}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="auth-password" className="text-sm font-medium text-slate-700">
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
              <PasswordInput
                id="auth-password"
                value={password}
                onChange={setPassword}
                visible={showPassword}
                onToggleVisible={() => setShowPassword((current) => !current)}
                autoComplete={isSignUp ? "new-password" : "current-password"}
              />
            </div>

            {isSignUp && (
              <div className="space-y-1.5">
                <label htmlFor="auth-confirm-password" className="text-sm font-medium text-slate-700">
                  Confirm password
                </label>
                <PasswordInput
                  id="auth-confirm-password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  visible={showPassword}
                  onToggleVisible={() => setShowPassword((current) => !current)}
                  autoComplete="new-password"
                  invalid={passwordsMismatch}
                />
                {passwordsMismatch && (
                  <p className="text-xs text-red-600">Passwords don&apos;t match.</p>
                )}
              </div>
            )}

            {isSignUp && (
              <fieldset className="space-y-2">
                <div className="flex items-center justify-between">
                  <legend className="text-sm font-medium text-slate-700">
                    What describes you best?{" "}
                    <span className="font-normal text-slate-400">(optional)</span>
                  </legend>
                  {/* A radio can't be unchecked by clicking it again. */}
                  {userType && (
                    <button
                      type="button"
                      onClick={() => setUserType(null)}
                      className="text-xs font-medium text-slate-500 hover:text-slate-700 hover:underline"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {USER_TYPES.map((option) => (
                    <label
                      key={option.value}
                      className={cn(
                        "flex h-10 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm transition-colors",
                        userType === option.value
                          ? "border-blue-500 bg-blue-50 text-blue-800"
                          : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white"
                      )}
                    >
                      <input
                        type="radio"
                        name="user-type"
                        value={option.value}
                        checked={userType === option.value}
                        onChange={() => setUserType(option.value)}
                        className="size-4 accent-blue-600"
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {error && <p className="text-xs text-red-600">{error}</p>}
            {message && (
              <p className="text-xs text-slate-500">
                {message}
                {pendingConfirmation && (
                  <>
                    {" "}
                    <button
                      type="button"
                      onClick={handleResendConfirmation}
                      className="font-medium text-blue-700 hover:text-blue-800 hover:underline"
                    >
                      Resend email
                    </button>
                  </>
                )}
              </p>
            )}

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
              onClick={switchMode}
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
