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
import { readKanbanCards } from "@/lib/kanban"
import {
  type RestorePlan,
  parseBackup,
  planRestore,
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
import { RestoreBackupDialog } from "@/components/settings/restore-backup-dialog"
import { useWorkspaces } from "@/components/workspaces/workspace-provider"
import { clearLocalCache, exportUserData } from "@/lib/privacy-data"

const THIRD_PARTY_SERVICES = [
  {
    icon: Database,
    label: "Supabase",
    description:
      "Stores your account, profile, saved sessions, and dashboard layout over HTTPS, protected by Row-Level Security scoped to your account. Your tasks and bookmarks are never uploaded - they stay on this device. Zero network requests while signed out.",
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
      "Your tasks and bookmarks never leave this device - they're stored in this browser's local storage and Chrome's own bookmark store, not synced to any server.",
  },
  {
    icon: ShieldCheck,
    label: "Row-Level Security",
    description:
      "Cloud data (your account and saved sessions) is strictly locked to your authenticated user ID - only you can read or write it.",
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
    currentTaskCount: number
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
    const currentTaskCount = plan.tasks ? (await readKanbanCards()).length : 0
    setRestoreError(null)
    setPendingRestore({ plan, currentTaskCount })
  }

  async function handleConfirmRestore() {
    if (!pendingRestore) return
    try {
      const { failed } = await restoreBackup(pendingRestore.plan, workspaces, registerWorkspace)
      if (failed.length > 0) {
        setRestoreError(
          `Couldn't restore ${failed.map((name) => `“${name}”`).join(", ")}, so ${
            failed.length === 1 ? "it was" : "they were"
          } left unchanged. Everything else was restored.`
        )
      } else {
        flashStatus("Restored ✓")
      }
    } catch (error) {
      console.error("[StashWell] Restore failed:", error)
      setRestoreError("Couldn't restore that backup.")
    }
    onReloadHiddenFolders()
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
              "Put every workspace in a backup file and your kanban board back as they were. Saved sessions aren't changed."
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
            hint="Removes cached tasks, saved sessions, and dashboard layout stored on this device."
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
              device will be permanently removed. This can&apos;t be undone -
              export a backup first if you want to keep them.
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
          currentTaskCount={pendingRestore.currentTaskCount}
          onOpenChange={(open) => !open && setPendingRestore(null)}
          onConfirm={handleConfirmRestore}
        />
      )}
    </div>
  )
}
