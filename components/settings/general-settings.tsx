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
  onNotesEnabledChange,
  onRemindersEnabledChange,
}: {
  settings: AppearanceSettings
  onGreetingEnabledChange: (enabled: boolean) => void
  onGreetingNameChange: (name: string) => void
  onSearchBarEnabledChange: (enabled: boolean) => void
  onNotesEnabledChange: (enabled: boolean) => void
  onRemindersEnabledChange: (enabled: boolean) => void
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

        <Group
          title="Dashboard cards"
          description="Notes and reminders sit alongside your folder cards."
        >
          <Row
            label="Show notes"
            control={
              <Switch
                checked={settings.notesEnabled}
                onCheckedChange={onNotesEnabledChange}
              />
            }
          />
          <Row
            label="Show reminders"
            control={
              <Switch
                checked={settings.remindersEnabled}
                onCheckedChange={onRemindersEnabledChange}
              />
            }
          />
        </Group>
      </div>
    </div>
  )
}
