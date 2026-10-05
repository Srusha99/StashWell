"use client"

import * as React from "react"
import {
  Cloud,
  CloudAlert,
  CloudOff,
  LoaderCircle,
  RefreshCw,
  type LucideIcon,
} from "lucide-react"

import { useSignInPrompt } from "@/components/auth/sign-in-prompt"
import { Button } from "@/components/ui/button"
import { Group, PaneHeader, Row } from "@/components/settings/settings-parts"
import { type SyncState, type SyncStatus, useSyncState } from "@/hooks/use-dashboard-sync"
import { useAuth } from "@/lib/auth-context"
import { SYNC_VERSION, syncNow } from "@/lib/dashboard-sync-engine"
import { cn, deferred } from "@/lib/utils"

const STATUS: Record<SyncStatus, { icon: LucideIcon; title: string; description: string; spin?: boolean }> = {
  idle: {
    icon: LoaderCircle,
    title: "Getting ready…",
    description: "Checking your account for changes from your other devices.",
    spin: true,
  },
  saving: {
    icon: LoaderCircle,
    title: "Saving your changes…",
    description: "Uploading what changed on this device.",
    spin: true,
  },
  synced: {
    icon: Cloud,
    title: "Everything's in sync.",
    description: "This device matches every other device you sign in on.",
  },
  offline: {
    icon: CloudOff,
    title: "You're offline.",
    description: "Changes are saved on this device and sync as soon as you're back online.",
  },
  error: {
    icon: CloudAlert,
    title: "Sync paused.",
    description:
      "Couldn't reach your account. Changes are saved on this device, and syncing retries on its own.",
  },
}

const BOOKMARK_NOTES: Record<NonNullable<SyncState["bookmarks"]>, string> = {
  stashwell: "Bookmarks Bar and your workspaces",
  chrome: "Chrome Sync already syncs this PC's bookmarks, so StashWell leaves them to it",
  "other-account": "Not synced - this PC's bookmarks belong to a different StashWell account",
}

const SYNCED_ITEMS: { label: string; hint: string }[] = [
  { label: "Dashboard layout", hint: "Card order, hidden cards, grid or list view" },
  { label: "Saved sessions", hint: "Your saved tab bundles" },
  { label: "Tasks", hint: "The kanban board" },
  { label: "Appearance", hint: "Wallpaper, greeting and card style - uploaded backgrounds stay on this PC" },
]

/** The box both states share: a big icon, a line, a sentence, and an action. */
function StatusCard({
  icon: Icon,
  title,
  description,
  spin,
  tone,
  children,
}: {
  icon: LucideIcon
  title: string
  description: string
  spin?: boolean
  tone?: "warning"
  children?: React.ReactNode
}) {
  return (
    <section className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-muted/30 px-6 py-7 text-center">
      <Icon
        aria-hidden
        className={cn(
          "mb-1 size-7 text-muted-foreground",
          spin && "animate-spin",
          tone === "warning" && "text-amber-500"
        )}
      />
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{description}</p>
      {children && <div className="mt-3">{children}</div>}
    </section>
  )
}

/**
 * Settings > Sync: whether this device is syncing with the user's account, and
 * what that covers. Signed out (Local Mode), it's where to sign in.
 */
export function SyncSettings({ onCloseSettings }: { onCloseSettings: () => void }) {
  const { user } = useAuth()
  const { status, lastSyncedAt, bookmarks } = useSyncState()
  const openSignIn = useSignInPrompt()

  if (!user) {
    return (
      <div>
        <PaneHeader title="Sync" description="Keep your workspace identical on every machine." />
        <StatusCard
          icon={CloudOff}
          title="You're working locally."
          description="Everything lives in this browser. Sign in to sync across devices and back up to the cloud."
        >
          <button
            type="button"
            // The sign-in form opens over the whole page, so Settings closes
            // first rather than holding focus underneath it.
            onClick={() => {
              onCloseSettings()
              deferred(openSignIn)()
            }}
            className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-600"
          >
            Sign in to sync
          </button>
        </StatusCard>
      </div>
    )
  }

  const current = STATUS[status]
  const busy = status === "saving" || status === "idle"
  return (
    <div className="flex flex-col gap-4">
      <PaneHeader title="Sync" description="Keep your workspace identical on every machine." />

      <StatusCard
        icon={current.icon}
        title={current.title}
        description={current.description}
        spin={current.spin}
        tone={status === "error" ? "warning" : undefined}
      >
        <Button variant="outline" size="sm" onClick={syncNow} disabled={busy || status === "offline"}>
          <RefreshCw /> Sync now
        </Button>
      </StatusCard>

      <Group title="What syncs">
        <Row
          label="Bookmarks"
          hint={BOOKMARK_NOTES[bookmarks ?? "stashwell"]}
          control={<SyncedMark on={bookmarks !== "chrome" && bookmarks !== "other-account"} />}
        />
        {SYNCED_ITEMS.map((item) => (
          <Row key={item.label} label={item.label} hint={item.hint} control={<SyncedMark on />} />
        ))}
      </Group>

      <Group title="This device">
        <Row label="Account" control={<span className="text-xs text-muted-foreground">{user.email}</span>} />
        <Row
          label="Last synced"
          control={
            <span className="text-xs text-muted-foreground">
              {lastSyncedAt
                ? new Date(lastSyncedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
                : "Not yet"}
            </span>
          }
        />
        <Row
          label="Sync version"
          hint="The same on every device once each has the latest StashWell."
          control={<span className="text-xs text-muted-foreground">v{SYNC_VERSION}</span>}
        />
      </Group>
    </div>
  )
}

function SyncedMark({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-medium",
        on
          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
          : "bg-muted text-muted-foreground"
      )}
    >
      {on ? "On" : "Off"}
    </span>
  )
}
