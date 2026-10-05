import {
  Bookmark,
  Globe,
  HardDrive,
  ImageIcon,
  KeyRound,
  MousePointerClick,
  SquareStack,
  type LucideIcon,
} from "lucide-react"

import manifest from "@/public/manifest.json"

export interface PermissionInfo {
  key: string
  label: string
  description: string
  icon: LucideIcon
}

/**
 * One entry per permission StashWell actually asks Chrome for - see each
 * permission's own usage (lib/bookmarks.ts, lib/dashboard-sync-engine.ts,
 * public/background.js, lib/favicon.ts, lib/googleAuth.ts + lib/gcal-service.ts).
 * Keyed by the exact string in manifest.json's `permissions` array.
 */
const KNOWN_PERMISSIONS: Record<string, Omit<PermissionInfo, "key">> = {
  bookmarks: {
    label: "Bookmarks",
    description: "Reads and organizes your Chrome bookmarks - the core of StashWell.",
    icon: Bookmark,
  },
  storage: {
    label: "Storage",
    description: "Saves your tasks, layout, and preferences locally on this device.",
    icon: HardDrive,
  },
  tabs: {
    label: "Tabs",
    description: "Opens the onboarding tab on install and reopens tabs saved in a Tab Session Bundle.",
    icon: SquareStack,
  },
  contextMenus: {
    label: "Context Menus",
    description: "Adds the right-click “Save all open tabs in window as bundle” option.",
    icon: MousePointerClick,
  },
  favicon: {
    label: "Favicons",
    description: "Shows each site's real favicon next to its bookmark.",
    icon: ImageIcon,
  },
  identity: {
    label: "Identity",
    description: "Signs you in with Google and connects Google Calendar for task due dates.",
    icon: KeyRound,
  },
}

/** Keyed by the exact host pattern in manifest.json's `host_permissions`. */
const HOST_PERMISSION_DESCRIPTIONS: Record<string, string> = {
  "https://www.google.com/*":
    "Lets StashWell fetch favicons directly from Google's servers without being blocked by cross-site restrictions.",
}

function hostLabel(host: string): string {
  try {
    return new URL(host.replace(/\/\*$/, "")).hostname
  } catch {
    return host
  }
}

/**
 * Reads the actual manifest.json permissions rather than a hand-kept
 * duplicate list, so this can't silently drift from what's really declared.
 * Anything not in the maps above still shows up, with a generic description,
 * instead of disappearing.
 */
export function getPermissionEntries(): PermissionInfo[] {
  const permissions = manifest.permissions ?? []
  const hostPermissions = manifest.host_permissions ?? []

  const entries: PermissionInfo[] = permissions.map((key) => {
    const known = KNOWN_PERMISSIONS[key]
    return known ? { key, ...known } : { key, label: key, description: "Used by StashWell.", icon: Globe }
  })

  for (const host of hostPermissions) {
    entries.push({
      key: host,
      label: hostLabel(host),
      description: HOST_PERMISSION_DESCRIPTIONS[host] ?? `Allows network access to ${host}.`,
      icon: Globe,
    })
  }

  return entries
}
