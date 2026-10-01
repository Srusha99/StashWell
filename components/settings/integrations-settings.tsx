"use client"

import * as React from "react"
import { CalendarDays } from "lucide-react"

import {
  connectCalendar,
  disconnectCalendar,
  hasCalendarAccess,
  hasIdentityApi,
  isCalendarSyncEnabled,
  readCalendarSyncFlag,
} from "@/lib/gcal-service"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Group, PaneHeader } from "@/components/settings/settings-parts"

/** "needs-sign-in": switched on, but Google no longer grants access. */
type CalendarStatus =
  | "checking"
  | "connecting"
  | "connected"
  | "not-connected"
  | "needs-sign-in"

/**
 * Third-party connections. Google Calendar is the only one today - task due
 * dates sync to it as events - but this is where any future integration
 * (Notion, Slack, ...) would live rather than crowding Permissions, which is
 * a read-only audit of the extension's own manifest access.
 */
export function IntegrationsSettings() {
  // Seeded from the stored flag so the switch is right on the first frame
  // (this pane only mounts client-side, once its section is opened); only the
  // badge has to wait on Chrome.
  const [calendarEnabled, setCalendarEnabled] = React.useState(
    () => readCalendarSyncFlag() ?? false
  )
  const [calendarStatus, setCalendarStatus] = React.useState<CalendarStatus>(() =>
    hasIdentityApi() ? "checking" : "not-connected"
  )
  const [error, setError] = React.useState<string | null>(null)
  // Set on the first flip, so the mount-time status check can't land after it
  // and overwrite what the user just chose.
  const toggledRef = React.useRef(false)

  // The toggle is the stored choice. Token access only feeds the badge - a
  // silent getAuthToken succeeds for as long as Google holds the grant, which
  // is what used to make this read "Connected" after every disconnect.
  React.useEffect(() => {
    if (!hasIdentityApi()) return
    let active = true

    async function load() {
      const enabled = await isCalendarSyncEnabled()
      let status: CalendarStatus = "not-connected"
      if (enabled) status = (await hasCalendarAccess()) ? "connected" : "needs-sign-in"
      if (!active || toggledRef.current) return
      setCalendarEnabled(enabled)
      setCalendarStatus(status)
    }

    void load()
    return () => {
      active = false
    }
  }, [])

  // Optimistic: the switch moves on click, not after Google answers. Off never
  // waits - the flag is written synchronously and the revoke finishes in the
  // background. On waits only for the consent screen, and snaps back if the
  // user closes it.
  async function handleToggle(next: boolean) {
    toggledRef.current = true
    setError(null)
    setCalendarEnabled(next)

    if (!next) {
      setCalendarStatus("not-connected")
      void disconnectCalendar()
      return
    }

    setCalendarStatus("connecting")
    const { error: connectError } = await connectCalendar()
    if (connectError) {
      setCalendarEnabled(false)
      setCalendarStatus("not-connected")
      setError(connectError)
      return
    }
    setCalendarStatus("connected")
  }

  return (
    <div>
      <PaneHeader
        title="Integrations"
        description="Connect StashWell to other services."
      />

      <div className="flex flex-col gap-4">
        <Group
          title="Google Calendar"
          description="Used to sync task due dates as calendar events."
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <CalendarDays className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="text-[13px] font-medium text-foreground">Calendar access</span>
              <CalendarStatusBadge status={calendarStatus} />
            </div>
            <Switch
              checked={calendarEnabled}
              onCheckedChange={(checked) => void handleToggle(checked)}
              // Held only while the consent screen is up, so a second click
              // can't open another one on top of it.
              disabled={!hasIdentityApi() || calendarStatus === "connecting"}
              aria-label="Sync task due dates to Google Calendar"
            />
          </div>
          {error && <p className="text-[11px] text-destructive">{error}</p>}
          {!error && calendarStatus === "needs-sign-in" && (
            <p className="text-[11px] text-muted-foreground">
              Google no longer grants StashWell access. Turn this off and on again to reconnect.
            </p>
          )}
        </Group>
      </div>
    </div>
  )
}

function CalendarStatusBadge({ status }: { status: CalendarStatus }) {
  if (status === "checking" || status === "connecting") {
    return (
      <Badge variant="outline">{status === "checking" ? "Checking…" : "Connecting…"}</Badge>
    )
  }
  if (status === "connected") {
    return (
      <Badge className="border-transparent bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
        Connected
      </Badge>
    )
  }
  if (status === "needs-sign-in") {
    return (
      <Badge className="border-transparent bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
        Sign-in needed
      </Badge>
    )
  }
  return <Badge variant="secondary">Not Connected</Badge>
}
