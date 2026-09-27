"use client"

import * as React from "react"

/**
 * Bump this string whenever there's a new changelog to show - everyone who
 * already saw an older version gets the dot (and the toast) again with no
 * migration code, since "seen"/"dismissed" are stored as this version string
 * itself, not a boolean.
 */
const CURRENT_WHATS_NEW_VERSION = "2026-09-27"

const SEEN_STORAGE_KEY = "bm:whats-new-seen-version"
const TOAST_DISMISSED_STORAGE_KEY = "bm:whats-new-toast-dismissed"

function hasChromeStorage(): boolean {
  return typeof chrome !== "undefined" && !!chrome.storage?.local
}

async function readVersion(key: string): Promise<string | null> {
  try {
    if (hasChromeStorage()) {
      const stored = await chrome.storage.local.get(key)
      return (stored[key] as string | undefined) ?? null
    }
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeVersion(key: string, version: string) {
  try {
    if (hasChromeStorage()) {
      void chrome.storage.local.set({ [key]: version })
    } else {
      window.localStorage.setItem(key, version)
    }
  } catch {
    // ignore write failures (e.g. storage disabled)
  }
}

export function useWhatsNew(): {
  hasUnread: boolean
  markSeen: () => void
  showToast: boolean
  dismissToast: () => void
} {
  // Both start "seen"/"dismissed" (nothing shown) and load the real values in
  // the effect below, since chrome.storage.local.get is async - a brief
  // false-negative reads better here than a dot/toast flashing on then off.
  const [seenVersion, setSeenVersion] = React.useState<string | null>(
    CURRENT_WHATS_NEW_VERSION
  )
  const [dismissedVersion, setDismissedVersion] = React.useState<string | null>(
    CURRENT_WHATS_NEW_VERSION
  )

  React.useEffect(() => {
    let active = true
    Promise.all([
      readVersion(SEEN_STORAGE_KEY),
      readVersion(TOAST_DISMISSED_STORAGE_KEY),
    ]).then(([seen, dismissed]) => {
      if (!active) return
      setSeenVersion(seen)
      setDismissedVersion(dismissed)
    })
    return () => {
      active = false
    }
  }, [])

  // Picks up another context (e.g. the popup) marking this seen/dismissed.
  React.useEffect(() => {
    if (!hasChromeStorage()) return
    function handleChange(
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: chrome.storage.AreaName
    ) {
      if (areaName !== "local") return
      const seenChange = changes[SEEN_STORAGE_KEY]
      if (seenChange) {
        setSeenVersion((seenChange.newValue as string | undefined) ?? null)
      }
      const dismissedChange = changes[TOAST_DISMISSED_STORAGE_KEY]
      if (dismissedChange) {
        setDismissedVersion(
          (dismissedChange.newValue as string | undefined) ?? null
        )
      }
    }
    chrome.storage.onChanged.addListener(handleChange)
    return () => chrome.storage.onChanged.removeListener(handleChange)
  }, [])

  const markSeen = React.useCallback(() => {
    setSeenVersion(CURRENT_WHATS_NEW_VERSION)
    writeVersion(SEEN_STORAGE_KEY, CURRENT_WHATS_NEW_VERSION)
  }, [])

  const dismissToast = React.useCallback(() => {
    setDismissedVersion(CURRENT_WHATS_NEW_VERSION)
    writeVersion(TOAST_DISMISSED_STORAGE_KEY, CURRENT_WHATS_NEW_VERSION)
  }, [])

  return {
    hasUnread: seenVersion !== CURRENT_WHATS_NEW_VERSION,
    markSeen,
    showToast:
      seenVersion !== CURRENT_WHATS_NEW_VERSION &&
      dismissedVersion !== CURRENT_WHATS_NEW_VERSION,
    dismissToast,
  }
}
