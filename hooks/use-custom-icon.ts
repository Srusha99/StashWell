"use client"

import * as React from "react"

import { clearCustomIcon, getCustomIcon, setCustomIcon } from "@/lib/custom-icons"

export function useCustomIcon(
  url: string | null
): [string | null, (dataUrl: string) => void, () => void] {
  const [icon, setIconState] = React.useState<string | null>(() => (url ? getCustomIcon(url) : null))

  const update = React.useCallback(
    (dataUrl: string) => {
      if (!url) return
      setCustomIcon(url, dataUrl)
      setIconState(dataUrl)
    },
    [url]
  )

  const clear = React.useCallback(() => {
    if (!url) return
    clearCustomIcon(url)
    setIconState(url ? getCustomIcon(url) : null)
  }, [url])

  return [icon, update, clear]
}
