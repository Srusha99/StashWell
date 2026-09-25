"use client"
import * as React from "react"

import { BookmarkApp } from "@/components/bookmarks/bookmark-app"
import { SessionBundlesPopup } from "@/components/session-bundles/session-bundles-popup"
import { KanbanBoard } from "@/components/kanban/kanban-board"
import { KanbanPanel } from "@/components/kanban/kanban-panel"
import { AuthProvider, useAuth } from "@/lib/auth-context"
import { AuthForm } from "@/components/auth/auth-form"

type View = "dashboard" | "popup" | "kanban" | "kanban-panel"

/**
 * The toolbar popup (manifest.json action.default_popup), the floating
 * Kanban window (opened via chrome.windows.create), and the docked on-page
 * Kanban panel (opened by content.js inside an iframe) all point at this same
 * "index.html?view=..." rather than a separate route. A second static route
 * reproducibly broke hydration of this page under this project's
 * Next/Turbopack static-export setup (confirmed with a from-scratch build,
 * no caching involved) - branching on a query param client-side keeps Next
 * building exactly one route, which is the configuration proven to work.
 */
export default function Page() {
  const [view, setView] = React.useState<View | null>(null)

  React.useEffect(() => {
    // Deferred a tick rather than calling setView synchronously here: reading
    // window.location.search must happen client-only (it'd mismatch the
    // static-export prerender, which always bakes in the dashboard), and this
    // keeps the update out of the initial commit phase.
    queueMicrotask(() => {
      const params = new URLSearchParams(window.location.search)
      const requested = params.get("view")
      const views: View[] = ["popup", "kanban", "kanban-panel"]
      setView((views as string[]).includes(requested ?? "") ? (requested as View) : "dashboard")
    })
  }, [])

  if (view === "popup") return <SessionBundlesPopup />
  if (view === "kanban") return <KanbanBoard />
  if (view === "kanban-panel") return <KanbanPanel />
  if (view === "dashboard") {
    return (
      <AuthProvider>
        <DashboardGate />
      </AuthProvider>
    )
  }
  return null
}

function DashboardGate() {
  const { user, loading } = useAuth()

  if (loading) return null
  if (!user) return <AuthForm />
  return <BookmarkApp />
}
