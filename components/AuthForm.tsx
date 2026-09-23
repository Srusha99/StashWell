"use client"

import * as React from "react"
import { supabase } from "@/lib/supabaseClient"

type Status = { type: "success" | "error"; message: string } | null

export function AuthForm() {
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [loading, setLoading] = React.useState<"signup" | "login" | "logout" | null>(null)
  const [status, setStatus] = React.useState<Status>(null)

  async function handleSignUp() {
    setLoading("signup")
    setStatus(null)
    const { error } = await supabase.auth.signUp({ email, password })
    setStatus(error ? { type: "error", message: error.message } : { type: "success", message: "Signed up! Check your email to confirm." })
    setLoading(null)
  }

  async function handleLogin() {
    setLoading("login")
    setStatus(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setStatus(error ? { type: "error", message: error.message } : { type: "success", message: "Logged in successfully." })
    setLoading(null)
  }

  async function handleLogout() {
    setLoading("logout")
    setStatus(null)
    const { error } = await supabase.auth.signOut()
    setStatus(error ? { type: "error", message: error.message } : { type: "success", message: "Logged out." })
    setLoading(null)
  }

  const disabled = loading !== null

  return (
    <div style={{ maxWidth: 320, padding: 16, border: "1px solid #ddd", borderRadius: 8, marginBottom: 16 }}>
      <div style={{ marginBottom: 8 }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={disabled}
          style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
        />
      </div>
      <div style={{ marginBottom: 8 }}>
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={disabled}
          style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
        />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={handleSignUp} disabled={disabled} style={{ flex: 1, padding: 8 }}>
          {loading === "signup" ? "Signing up..." : "Sign Up"}
        </button>
        <button onClick={handleLogin} disabled={disabled} style={{ flex: 1, padding: 8 }}>
          {loading === "login" ? "Logging in..." : "Login"}
        </button>
        <button onClick={handleLogout} disabled={disabled} style={{ flex: 1, padding: 8 }}>
          {loading === "logout" ? "Logging out..." : "Logout"}
        </button>
      </div>
      {status && (
        <p style={{ marginTop: 8, color: status.type === "error" ? "#c00" : "#080", fontSize: 14 }}>
          {status.message}
        </p>
      )}
    </div>
  )
}
