"use client"

import * as React from "react"
import {
  CalendarDays,
  Database,
  Download,
  ImageIcon,
  KeyRound,
  Laptop,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react"

import { getTree } from "@/lib/bookmarks"
import {
  type RestoreCounts,
  type RestorePlan,
  mergeBackup,
  parseBackup,
  planRestore,
  readRestoreCounts,
  restoreBackup,
} from "@/lib/workspace-backup"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Group, PaneHeader, Row } from "@/components/settings/settings-parts"
import {
  type RestoreMode,
  type RestoreOutcome,
  RestoreBackupDialog,
} from "@/components/settings/restore-backup-dialog"
import { useWorkspaces } from "@/components/workspaces/workspace-provider"
import { clearLocalCache, exportUserData } from "@/lib/privacy-data"

const THIRD_PARTY_SERVICES = [
  {
    icon: Database,
    label: "Supabase",
    description:
      "While you're signed in, stores your account, profile, tasks, saved sessions, dashboard layout, appearance settings, and the bookmarks your dashboard shows (the Bookmarks Bar and your StashWell workspaces - titles and links) over HTTPS, protected by Row-Level Security scoped to your account, so they're the same on every device you sign in on. Other bookmarks are never read. Where Chrome Sync already syncs a device's bookmarks, StashWell doesn't upload them. Zero network requests while signed out.",
  },
  {
    icon: CalendarDays,
    label: "Google OAuth & Calendar",
    description:
      "Used strictly for signing you in and syncing task due dates to your calendar (calendar.events scope). We never access your contacts, Drive, or other private data.",
  },
  {
    icon: ImageIcon,
    label: "Favicons",
    description:
      "Site icons load from Google's public favicon service when available, falling back to Chrome's own favicon cache. No tracking cookies or analytics are attached to these requests.",
  },
]

const SECURITY_COMMITMENTS = [
  {
    icon: Laptop,
    label: "Local-first by design",
    description:
      "Everything is saved on this device first and works offline. Signed out (Local Mode), nothing leaves this device; signed in, your dashboard syncs to your account and back.",
  },
  {
    icon: ShieldCheck,
    label: "Row-Level Security",
    description:
      "Cloud data (your account, bookmarks, tasks, saved sessions, layout and settings) is strictly locked to your authenticated user ID - only you can read or write it.",
  },
  {
    icon: KeyRound,
    label: "Instant token purge",
    description:
      "Signing out from the avatar menu instantly clears your local session token.",
  },
]

/**
 * What StashWell sends off this device, what stays local, and the
 * self-serve data actions - export a backup, restore one, clear the cache.
 * Sits alongside Integrations and Permissions in the settings rail rather
 * than inside either - it's about data handling, not about a specific
 * connection or the extension's own manifest access.
 */
export function PrivacySettings({
  onReloadHiddenFolders,
}: {
  /** A restore writes the hidden-folders list itself; this re-reads it into the shared state. */
  onReloadHiddenFolders: () => void
}) {
  const { workspaces, registerWorkspace } = useWorkspaces()
  const [isExporting, setIsExporting] = React.useState(false)
  const [isClearing, setIsClearing] = React.useState(false)
  const [confirmingClear, setConfirmingClear] = React.useState(false)
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null)
  const [pendingRestore, setPendingRestore] = React.useState<{
    plan: RestorePlan
    counts: RestoreCounts
  } | null>(null)
  const [restoreError, setRestoreError] = React.useState<string | null>(null)
  const restoreFileInputRef = React.useRef<HTMLInputElement>(null)

  function flashStatus(message: string) {
    setStatusMessage(message)
    setTimeout(() => setStatusMessage(null), 1500)
  }

  async function handleExport() {
    setIsExporting(true)
    try {
      await exportUserData(workspaces)
      flashStatus("Exported ✓")
    } finally {
      setIsExporting(false)
    }
  }

  function handleRestoreClick() {
    setRestoreError(null)
    restoreFileInputRef.current?.click()
  }

  async function handleRestoreFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return

    const backup = parseBackup(await file.text())
    if (!backup) {
      setRestoreError("That doesn't look like a StashWell backup.")
      return
    }
    const plan = planRestore(backup, workspaces, await getTree())
    if ("error" in plan) {
      setRestoreError(plan.error)
      return
    }
    setRestoreError(null)
    setPendingRestore({ plan, counts: await readRestoreCounts(plan) })
  }

  /** Runs the mode picked in RestoreBackupDialog, which shows the outcome (or a thrown error) itself. */
  async function handleConfirmRestore(mode: RestoreMode): Promise<RestoreOutcome> {
    if (!pendingRestore) throw new Error("No backup is waiting to be restored")
    const { plan } = pendingRestore
    try {
      if (mode === "merge") {
        const { failed, added } = await mergeBackup(plan, workspaces, registerWorkspace)
        return { mode, failed, added }
      }
      const { failed } = await restoreBackup(plan, workspaces, registerWorkspace)
      return { mode, failed }
    } finally {
      onReloadHiddenFolders()
    }
  }

  async function handleClearConfirmed() {
    setIsClearing(true)
    try {
      await clearLocalCache()
      setConfirmingClear(false)
      flashStatus("Cleared ✓")
    } finally {
      setIsClearing(false)
    }
  }

  return (
    <div>
      <PaneHeader
        title="Privacy"
        description="What StashWell sends off this device, and how to control your local data."
      />

      <div className="flex flex-col gap-4">
        <Group title="Third-Party Services & Data Flows">
          {THIRD_PARTY_SERVICES.map((service) => (
            <div key={service.label} className="flex items-start gap-3">
              <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
                <service.icon className="size-3.5 text-muted-foreground" />
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[13px] font-medium text-foreground">
                  {service.label}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {service.description}
                </span>
              </div>
            </div>
          ))}
        </Group>

        <Group title="Data Control & Security Commitments">
          {SECURITY_COMMITMENTS.map((item) => (
            <div key={item.label} className="flex items-start gap-3">
              <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
                <item.icon className="size-3.5 text-muted-foreground" />
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[13px] font-medium text-foreground">
                  {item.label}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {item.description}
                </span>
              </div>
            </div>
          ))}
        </Group>

        <Group title="Data Management Actions">
          {statusMessage && (
            <p className="text-[11px] text-muted-foreground">{statusMessage}</p>
          )}
          <Row
            label="Export my data"
            hint="Download a JSON backup of every workspace - bookmarks, card layout and hidden folders - plus your kanban board and saved sessions."
            control={
              <Button
                size="sm"
                variant="outline"
                onClick={handleExport}
                disabled={isExporting}
              >
                <Download className="size-3.5" />
                {isExporting ? "Exporting…" : "Export My Data (JSON)"}
              </Button>
            }
          />
          <Row
            label="Restore from backup"
            hint={
              restoreError ??
              "Bring a backup file back in - merge in only what's missing, or replace matching workspaces and the kanban board. You choose before anything changes."
            }
            control={
              <>
                <Button size="sm" variant="outline" onClick={handleRestoreClick}>
                  <Upload className="size-3.5" />
                  Restore
                </Button>
                <input
                  ref={restoreFileInputRef}
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={handleRestoreFileChange}
                />
              </>
            }
          />
          <Row
            label="Clear local cache"
            hint="Removes cached tasks, saved sessions, and dashboard layout stored on this device. Your account's synced copy isn't affected."
            control={
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setConfirmingClear(true)}
              >
                <Trash2 className="size-3.5" />
                Clear Local Cache
              </Button>
            }
          />
        </Group>
      </div>

      <Dialog open={confirmingClear} onOpenChange={setConfirmingClear}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear local cache?</DialogTitle>
            <DialogDescription>
              Tasks, saved tab sessions, and dashboard layouts stored on this
              device will be removed. Anything already synced to your account
              stays there and comes back the next time this device syncs -
              only changes that haven&apos;t synced yet are lost for good.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmingClear(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleClearConfirmed}
              disabled={isClearing}
            >
              {isClearing ? "Clearing..." : "Clear Local Cache"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {pendingRestore && (
        <RestoreBackupDialog
          plan={pendingRestore.plan}
          counts={pendingRestore.counts}
          onOpenChange={(open) => !open && setPendingRestore(null)}
          onConfirm={handleConfirmRestore}
        />
      )}
    </div>
  )
}
