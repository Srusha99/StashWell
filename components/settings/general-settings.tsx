"use client"

import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Group, PaneHeader, Row } from "@/components/settings/settings-parts"
import type { AppearanceSettings } from "@/hooks/use-appearance-settings"

export function GeneralSettings({
  settings,
  onGreetingEnabledChange,
  onGreetingNameChange,
  onSearchBarEnabledChange,
  onUse24HourClockChange,
}: {
  settings: AppearanceSettings
  onGreetingEnabledChange: (enabled: boolean) => void
  onGreetingNameChange: (name: string) => void
  onSearchBarEnabledChange: (enabled: boolean) => void
  onUse24HourClockChange: (enabled: boolean) => void
}) {
  return (
    <div>
      <PaneHeader
        title="General"
        description="What shows up on the dashboard."
      />

      <div className="flex flex-col gap-4">
        <Group title="Greeting" description="The welcome line under the clock.">
          <Row
            label="Show greeting"
            control={
              <Switch
                checked={settings.greetingEnabled}
                onCheckedChange={onGreetingEnabledChange}
              />
            }
          />
          <Row
            label="Your name"
            hint="Used in “Good morning …”."
            stacked
            disabled={!settings.greetingEnabled}
            control={
              <Input
                value={settings.greetingName}
                onChange={(event) => onGreetingNameChange(event.target.value)}
                placeholder="Enter your name"
                disabled={!settings.greetingEnabled}
                maxLength={40}
              />
            }
          />
        </Group>

        <Group title="Search">
          <Row
            label="Show search bar"
            hint="Searches Google in this tab."
            control={
              <Switch
                checked={settings.searchBarEnabled}
                onCheckedChange={onSearchBarEnabledChange}
              />
            }
          />
        </Group>

        <Group title="Clock" description="Applies to the dashboard clock and to-do due times.">
          <Row
            label="Use 24-hour clock"
            hint="18:00 instead of 6:00 PM."
            control={
              <Switch
                checked={settings.use24HourClock}
                onCheckedChange={onUse24HourClockChange}
              />
            }
          />
        </Group>
      </div>
    </div>
  )
}
