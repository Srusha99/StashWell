"use client"

import * as React from "react"

import { BookmarkApp } from "@/components/bookmarks/bookmark-app"
import { SessionBundlesPopup } from "@/components/session-bundles/session-bundles-popup"

/**
 * The toolbar popup (manifest.json action.default_popup) points at this same
 * "index.html?view=popup" rather than a separate route. A second static
 * route reproducibly broke hydration of this page under this project's
 * Next/Turbopack static-export setup (confirmed with a from-scratch build,
 * no caching involved) - branching on a query param client-side keeps Next
 * building exactly one route, which is the configuration proven to work.
 */
export default function Page() {
  const [view, setView] = React.useState<"dashboard" | "popup" | null>(null)

  React.useEffect(() => {
    // Deferred a tick rather than calling setView synchronously here: reading
    // window.location.search must happen client-only (it'd mismatch the
    // static-export prerender, which always bakes in the dashboard), and this
    // keeps the update out of the initial commit phase.
    queueMicrotask(() => {
      const params = new URLSearchParams(window.location.search)
      setView(params.get("view") === "popup" ? "popup" : "dashboard")
    })
  }, [])

  if (view === "popup") return <SessionBundlesPopup />
  if (view === "dashboard") return <BookmarkApp />
  return null
}
