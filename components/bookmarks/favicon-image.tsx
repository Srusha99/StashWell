"use client"

import * as React from "react"

import { peekFaviconSrc, resolveFaviconSrc } from "@/lib/favicon"
import { cn } from "@/lib/utils"

/**
 * Renders a bookmark's favicon. Waits for resolveFaviconSrc to confirm a
 * real icon exists (and fetch its bytes) before rendering anything, so a
 * generic placeholder is never displayed as if it were the site's own icon
 * - see that function for how it tells the two apart. Renders `fallback` if
 * none exists, or if the resolved source still somehow fails to load (a
 * network flake, not a "no icon" case - that's already been ruled out by
 * the time rendering starts).
 *
 * An icon resolved on an earlier load is cached (lib/favicon.ts), and is
 * drawn on the very first render, with nothing to wait for.
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
  const key = `${url}:${size}`
  const [lastKey, setLastKey] = React.useState(key)
  // undefined = still resolving, null = confirmed no icon anywhere.
  const [resolvedSrc, setResolvedSrc] = React.useState<string | null | undefined>(() =>
    peekFaviconSrc(url, size)
  )
  const [failed, setFailed] = React.useState(false)

  // Reset during render rather than in the effect below, so the stale
  // result from a previous url/size never flashes for a frame before the
  // effect gets a chance to run.
  if (key !== lastKey) {
    setLastKey(key)
    setResolvedSrc(peekFaviconSrc(url, size))
    setFailed(false)
  }

  // Runs even when the peek above already had an answer: that's what lets
  // an old cached icon be re-checked in the background (see lib/favicon.ts).
  // The object URLs it resolves to belong to that cache and are shared
  // between every icon for the same site, so they're never revoked here.
  React.useEffect(() => {
    let active = true
    resolveFaviconSrc(url, size).then((src) => {
      if (active) setResolvedSrc(src)
    })
    return () => {
      active = false
    }
  }, [url, size])

  // Holds the icon's slot while resolving, so the title beside it doesn't
  // jump sideways once the icon arrives.
  if (resolvedSrc === undefined) return <span aria-hidden className={cn("inline-block", className)} />
  if (resolvedSrc === null || failed) return <>{fallback}</>

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={resolvedSrc} alt="" className={className} onError={() => setFailed(true)} />
  )
}
