"use client"

import * as React from "react"
import { CalendarDays } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Group, PaneHeader } from "@/components/settings/settings-parts"

type CalendarStatus = "checking" | "connected" | "not-connected"

function hasIdentityApi(): boolean {
  return typeof chrome !== "undefined" && !!chrome.identity
}

/**
 * Third-party connections. Google Calendar is the only one today - task due
 * dates sync to it as events - but this is where any future integration
 * (Notion, Slack, ...) would live rather than crowding Permissions, which is
 * a read-only audit of the extension's own manifest access.
 */
export function IntegrationsSettings() {
  const [calendarStatus, setCalendarStatus] = React.useState<CalendarStatus>(() =>
    hasIdentityApi() ? "checking" : "not-connected"
  )
  const cachedTokenRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    if (!hasIdentityApi()) return
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (chrome.runtime.lastError || !token) {
        setCalendarStatus("not-connected")
        return
      }
      cachedTokenRef.current = token
      setCalendarStatus("connected")
    })
  }, [])

  function handleDisconnect() {
    const token = cachedTokenRef.current
    if (!hasIdentityApi() || !token) return
    chrome.identity.removeCachedAuthToken({ token }, () => {
      cachedTokenRef.current = null
      setCalendarStatus("not-connected")
    })
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
            <Button
              size="sm"
              variant="outline"
              disabled={calendarStatus !== "connected"}
              onClick={handleDisconnect}
            >
              Disconnect Calendar
            </Button>
          </div>
        </Group>
      </div>
    </div>
  )
}

function CalendarStatusBadge({ status }: { status: CalendarStatus }) {
  if (status === "checking") {
    return <Badge variant="outline">Checking…</Badge>
  }
  if (status === "connected") {
    return (
      <Badge className="border-transparent bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
        Connected
      </Badge>
    )
  }
  return <Badge variant="secondary">Not Connected</Badge>
}
