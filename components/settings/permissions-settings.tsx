"use client"

import * as React from "react"
import { ShieldCheck } from "lucide-react"

import { Group, PaneHeader } from "@/components/settings/settings-parts"
import { getPermissionEntries } from "@/lib/permissions"

/**
 * Read-only audit of what's in manifest.json's permissions/host_permissions
 * (via lib/permissions.ts). Not a permissions editor - Chrome doesn't let an
 * extension self-revoke its own manifest permissions at runtime.
 */
export function PermissionsSettings() {
  const permissions = React.useMemo(() => getPermissionEntries(), [])

  return (
    <div>
      <PaneHeader
        title="Permissions & Privacy"
        description="What StashWell can access on your device, and why."
      />

      <div className="flex flex-col gap-4">
        <Group title="Active Permissions">
          {permissions.map((permission) => (
            <div key={permission.key} className="flex items-start gap-3">
              <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
                <permission.icon className="size-3.5 text-muted-foreground" />
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[13px] font-medium text-foreground">
                  {permission.label}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {permission.description}
                </span>
              </div>
            </div>
          ))}
        </Group>

        <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground">Privacy first: </span>
            StashWell stores your data locally and securely via Supabase. We never sell or share your data.
          </p>
        </div>
      </div>
    </div>
  )
}
