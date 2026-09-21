"use client"

import * as React from "react"

import { faviconCandidates } from "@/lib/favicon"

/**
 * Renders a bookmark's favicon, retrying against the apex domain and then
 * falling back to `fallback` if every candidate 404s - see faviconCandidates.
 * Without this, a failed <img> load just renders nothing (alt is empty).
 */
export function FaviconImg({
  url,
  size = 32,
  className,
  fallback,
}: {
  url: string
  size?: number
  className?: string
  fallback: React.ReactNode
}) {
  const candidates = React.useMemo(() => faviconCandidates(url, size), [url, size])
  const [attempt, setAttempt] = React.useState(0)
  const [prevCandidates, setPrevCandidates] = React.useState(candidates)

  if (candidates !== prevCandidates) {
    setPrevCandidates(candidates)
    setAttempt(0)
  }

  if (attempt >= candidates.length) return <>{fallback}</>

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={attempt}
      src={candidates[attempt]}
      alt=""
      className={className}
      onError={() => setAttempt((current) => current + 1)}
    />
  )
}
