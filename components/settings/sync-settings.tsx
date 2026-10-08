"use client"

import * as React from "react"
import { CloudAlert, CloudOff, LoaderCircle, RefreshCw, Zap, type LucideIcon } from "lucide-react"

import { useSignInPrompt } from "@/components/auth/sign-in-prompt"
import { ProUpgradeModal } from "@/components/dashboard/pro-upgrade-modal"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Group, PaneHeader, ProBadge, Row } from "@/components/settings/settings-parts"
import { type SyncStatus, useBookmarkSyncPref, useSyncState } from "@/hooks/use-dashboard-sync"
import { useIsPro } from "@/hooks/use-is-pro"
import { useAuth } from "@/lib/auth-context"
import { writeBookmarkSyncPref } from "@/lib/bookmark-sync"
import { SYNC_VERSION, syncNow } from "@/lib/dashboard-sync-engine"
import { cn, deferred } from "@/lib/utils"

type Tier = "guest" | "free" | "pro"

const BANNERS: Record<Tier, { emoji: string; title: string; description: string }> = {
  guest: {
    emoji: "💻",
    title: "Local Mode",
    description: "All data is saved on this device only.",
  },
  free: {
    emoji: "☁️",
    title: "Single-Device Cloud Backup Active",
    description: "Your dashboard layout, tasks and settings are backed up to your account.",
  },
  pro: {
    emoji: "⚡",
    title: "Pro Real-Time Live Sync Active",
    description: "Every change reaches your other PCs as you make it.",
  },
}

/**
 * The live engine state worth calling out under the banner. "synced" isn't
 * here - the banner already says it's working.
 */
const STATUS_NOTES: Partial<Record<SyncStatus, { icon: LucideIcon; text: string; spin?: boolean; warning?: boolean }>> = {
  idle: { icon: LoaderCircle, text: "Getting ready…", spin: true },
  saving: { icon: LoaderCircle, text: "Saving your changes…", spin: true },
  offline: {
    icon: CloudOff,
    text: "You're offline. Changes are saved on this device and upload once you're back online.",
  },
  error: {
    icon: CloudAlert,
    text: "Couldn't reach your account. Changes are saved on this device, and it retries on its own.",
    warning: true,
  },
}

const BOOKMARKS_HINT = "Sync Bookmarks Bar & StashWell Workspaces. Turn off if using Chrome Sync."
const OTHER_ACCOUNT_HINT = "Not synced - this PC's bookmarks belong to a different StashWell account"
/** Shown while left off only because Chrome Sync was found carrying them (lib/bookmark-sync.ts). */
const CHROME_HINT =
  "Off - Chrome Sync carries these, but only to PCs on the same Google account. Turn on to sync them to all your StashWell PCs."

const UPGRADE_TITLE = "Upgrade to Real-Time Live Sync"
const UPGRADE_DESCRIPTION =
  "Pro keeps every PC you sign in on identical as you work - dashboard layout, tasks, bookmarks and saved sessions - instead of a single-device backup."

/** "Oct 6, 12:51 AM", or "Not yet". */
function formatTimestamp(at: number | null): string {
  if (!at) return "Not yet"
  return new Date(at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

/** The tier banner at the top of the pane: what this device is doing, and its one action. */
function TierBanner({ tier, children }: { tier: Tier; children?: React.ReactNode }) {
  const banner = BANNERS[tier]
  return (
    <section
      className={cn(
        "flex flex-col gap-3 rounded-xl border px-5 py-5",
        tier === "pro"
          ? "border-emerald-500/30 bg-emerald-500/[0.07]"
          : tier === "free"
            ? "border-sky-500/30 bg-sky-500/[0.07]"
            : "border-border bg-muted/30"
      )}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none" aria-hidden>
          {banner.emoji}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-sm font-semibold text-foreground">
            {banner.title}
            {tier === "guest" && <span className="font-normal text-muted-foreground"> — {banner.description}</span>}
          </p>
          {tier !== "guest" && <p className="text-xs text-muted-foreground">{banner.description}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

function StatusNote({ status }: { status: SyncStatus }) {
  const note = STATUS_NOTES[status]
  if (!note) return null
  const Icon = note.icon
  return (
    <p className={cn("flex items-center gap-1.5 text-[11px] text-muted-foreground", note.warning && "text-amber-600 dark:text-amber-400")}>
      <Icon aria-hidden className={cn("size-3.5 shrink-0", note.spin && "animate-spin")} />
      {note.text}
    </p>
  )
}

/** A Pro-only item's lock, with a tooltip saying what Pro adds. */
function LockedMark({ tooltip }: { tooltip: string }) {
  return (
    <span title={tooltip} aria-label={`Pro - ${tooltip}`} className="cursor-help">
      <ProBadge />
    </span>
  )
}

function ValueText({ children, live }: { children: React.ReactNode; live?: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-medium",
        live ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-sky-500/15 text-sky-600 dark:text-sky-400"
      )}
    >
      {children}
    </span>
  )
}

/**
 * Settings > Sync: the one place the account's sync tier shows - Local Mode
 * signed out, single-device cloud backup on Free, real-time live sync on Pro -
 * with that tier's action and what it covers. The dashboard itself shows none
 * of this.
 */
export function SyncSettings({ onCloseSettings }: { onCloseSettings: () => void }) {
  const { user } = useAuth()
  const { status, lastSyncedAt, bookmarks } = useSyncState()
  const openSignIn = useSignInPrompt()
  const isPro = useIsPro()
  const [upgradeOpen, setUpgradeOpen] = React.useState(false)
  const bookmarkSyncPref = useBookmarkSyncPref()
  // Never set: on, unless the first sync found Chrome Sync carrying them.
  const bookmarkSyncOn = bookmarkSyncPref === null ? bookmarks !== "chrome" : bookmarkSyncPref === "on"

  const tier: Tier = !user ? "guest" : isPro ? "pro" : "free"
  const busy = status === "saving" || status === "idle"

  const whatSyncs = (
    <Group title="What syncs">
      <Row
        label="Dashboard layout & tasks"
        hint="Card order, hidden cards, grid or list view, the kanban board and appearance"
        control={
          tier === "pro" ? (
            <ValueText live>Real-Time Live Sync</ValueText>
          ) : (
            <ValueText>Cloud Backup (Single-Device Recovery)</ValueText>
          )
        }
      />
      <Row
        label={tier === "pro" ? "Sync Bookmarks" : "Bookmarks"}
        hint={
          tier === "pro"
            ? bookmarkSyncOn && bookmarks === "other-account"
              ? OTHER_ACCOUNT_HINT
              : bookmarkSyncPref === null && bookmarks === "chrome"
                ? CHROME_HINT
                : BOOKMARKS_HINT
            : "Kept on this PC. Pro mirrors them to every PC you sign in on."
        }
        control={
          tier === "pro" ? (
            <Switch
              checked={bookmarkSyncOn}
              onCheckedChange={(checked) => writeBookmarkSyncPref(checked)}
              aria-label="Sync Bookmarks"
            />
          ) : (
            <LockedMark tooltip="Pro mirrors your Bookmarks Bar and workspaces across all your PCs in real time." />
          )
        }
      />
      <Row
        label="Saved sessions"
        hint={tier === "pro" ? "Your saved tab bundles - restore any of them on another PC" : "Kept on this PC. Pro restores them on your other PCs."}
        control={
          tier === "pro" ? (
            <ValueText live>Real-Time Live Sync</ValueText>
          ) : (
            <LockedMark tooltip="Pro syncs your saved tab bundles so you can restore them on any PC." />
          )
        }
      />
    </Group>
  )

  if (!user) {
    return (
      <div className="flex flex-col gap-4">
        <PaneHeader title="Sync" description="Your sync and backup status." />
        <TierBanner tier="guest">
          <div className="flex flex-col items-start gap-2">
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
              Sign In for Free Cloud Backup
            </button>
            <p className="text-[11px] text-muted-foreground">
              Log in to safeguard your dashboard layout, tasks, and settings with single-device cloud recovery.
            </p>
          </div>
        </TierBanner>
        {whatSyncs}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <PaneHeader title="Sync" description="Your sync and backup status." />

      <TierBanner tier={tier}>
        <div className="flex flex-col items-start gap-2">
          <Button variant="outline" size="sm" onClick={syncNow} disabled={busy || status === "offline"}>
            <RefreshCw className={cn(status === "saving" && "animate-spin")} />
            {tier === "pro" ? "Sync Now" : "Backup Now"}
          </Button>
          <StatusNote status={status} />
        </div>
      </TierBanner>

      {tier === "free" && (
        <section className="flex items-center justify-between gap-4 rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/[0.08] to-sky-500/[0.06] px-4 py-3.5">
          <p className="text-[13px] font-medium text-foreground">
            ⚡ Upgrade to Pro for Real-Time Multi-PC Live Sync &amp; Bookmark Mirroring
          </p>
          <Button
            size="sm"
            onClick={() => setUpgradeOpen(true)}
            className="shrink-0 bg-emerald-500 text-white hover:bg-emerald-600"
          >
            <Zap className="fill-current" /> Upgrade
          </Button>
        </section>
      )}

      {whatSyncs}

      <Group title="This device">
        <Row label="Account" control={<span className="text-xs text-muted-foreground">{user.email}</span>} />
        <Row
          label="Plan"
          control={
            tier === "pro" ? (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                💎 Pro Plan
              </span>
            ) : (
              <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold text-sky-600 dark:text-sky-400">
                Free Tier (Cloud Backup)
              </span>
            )
          }
        />
        <Row
          label={tier === "pro" ? "Last Live Sync" : "Last Cloud Backup"}
          control={<span className="text-xs text-muted-foreground">{formatTimestamp(lastSyncedAt)}</span>}
        />
        <Row
          label="Sync version"
          hint="The same on every device once each has the latest StashWell."
          control={<span className="text-xs text-muted-foreground">v{SYNC_VERSION}</span>}
        />
      </Group>

      <ProUpgradeModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        title={UPGRADE_TITLE}
        description={UPGRADE_DESCRIPTION}
      />
    </div>
  )
}
