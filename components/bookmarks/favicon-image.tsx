"use client"

import * as React from "react"

import { resolveFaviconSrc } from "@/lib/favicon"
import { cn } from "@/lib/utils"

/**
 * Renders a bookmark's favicon. Waits for resolveFaviconSrc to confirm a
 * real icon exists (and fetch its bytes) before rendering anything, so a
 * generic placeholder is never displayed as if it were the site's own icon
 * - see that function for how it tells the two apart. Renders `fallback` if
 * none exists, or if the resolved source still somehow fails to load (a
 * network flake, not a "no icon" case - that's already been ruled out by
 * the time rendering starts).
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
  const [resolvedSrc, setResolvedSrc] = React.useState<string | null | undefined>(undefined)
  const [failed, setFailed] = React.useState(false)

  // Reset during render rather than in the effect below, so the stale
  // result from a previous url/size never flashes for a frame before the
  // effect gets a chance to run.
  if (key !== lastKey) {
    setLastKey(key)
    setResolvedSrc(undefined)
    setFailed(false)
  }

  React.useEffect(() => {
    let active = true
    resolveFaviconSrc(url, size).then((src) => {
      if (active) setResolvedSrc(src)
    })
    return () => {
      active = false
    }
  }, [url, size])

  // resolveFaviconSrc hands back an object URL for a resolved icon it
  // fetched itself - that URL is only valid for this component's lifetime
  // and must be released, or the blob it points to leaks for the rest of
  // the page's life.
  React.useEffect(() => {
    if (!resolvedSrc?.startsWith("blob:")) return
    return () => URL.revokeObjectURL(resolvedSrc)
  }, [resolvedSrc])

  // Holds the icon's slot while resolving, so the title beside it doesn't
  // jump sideways once the icon arrives.
  if (resolvedSrc === undefined) return <span aria-hidden className={cn("inline-block", className)} />
  if (resolvedSrc === null || failed) return <>{fallback}</>

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={resolvedSrc} alt="" className={className} onError={() => setFailed(true)} />
  )
}
