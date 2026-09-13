"use client"

import * as React from "react"

import { clearCustomIcon, getCustomIcon, setCustomIcon } from "@/lib/custom-icons"

export function useCustomIcon(
  id: string | null
): [string | null, (dataUrl: string) => void, () => void] {
  const [icon, setIconState] = React.useState<string | null>(() => (id ? getCustomIcon(id) : null))

  const update = React.useCallback(
    (dataUrl: string) => {
      if (!id) return
      setCustomIcon(id, dataUrl)
      setIconState(dataUrl)
    },
    [id]
  )

  const clear = React.useCallback(() => {
    if (!id) return
    clearCustomIcon(id)
    setIconState(null)
  }, [id])

  return [icon, update, clear]
}
