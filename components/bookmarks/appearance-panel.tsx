"use client"

import { useTheme } from "next-themes"
import { Flame, Laptop, Moon, Snowflake, Sun, Waves } from "lucide-react"

import { cn } from "@/lib/utils"
import { Switch } from "@/components/ui/switch"
import type { AppearanceSettings, BackgroundColorMode } from "@/hooks/use-appearance-settings"

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Laptop },
] as const

const BACKGROUND_OPTIONS: { value: BackgroundColorMode; label: string; icon: typeof Waves }[] = [
  { value: "molten", label: "Molten", icon: Waves },
  { value: "ember", label: "Ember", icon: Flame },
  { value: "frost", label: "Frost", icon: Snowflake },
]

function OptionButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: typeof Sun
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-xs font-medium transition-colors",
        active
          ? "border-white/20 bg-white/10 text-white"
          : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
      )}
    >
      <Icon className="size-4" />
      {label}
    </button>
  )
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div>
        <h3 className="text-sm font-medium text-white">{title}</h3>
        {description && <p className="text-xs text-white/50">{description}</p>}
      </div>
      {children}
    </div>
  )
}

export function AppearancePanel({
  settings,
  onColorModeChange,
  onBackgroundEnabledChange,
  onCursorGlowEnabledChange,
}: {
  settings: AppearanceSettings
  onColorModeChange: (mode: BackgroundColorMode) => void
  onBackgroundEnabledChange: (enabled: boolean) => void
  onCursorGlowEnabledChange: (enabled: boolean) => void
}) {
  const { theme, setTheme } = useTheme()

  return (
    <div className="flex max-w-md flex-col gap-6">
      <Section title="Theme" description="Choose how the dashboard looks.">
        <div className="flex gap-2">
          {THEME_OPTIONS.map((option) => (
            <OptionButton
              key={option.value}
              active={theme === option.value}
              onClick={() => setTheme(option.value)}
              icon={option.icon}
              label={option.label}
            />
          ))}
        </div>
      </Section>

      <Section title="Background style" description="Pick the animated background's color palette.">
        <div className="flex gap-2">
          {BACKGROUND_OPTIONS.map((option) => (
            <OptionButton
              key={option.value}
              active={settings.colorMode === option.value}
              onClick={() => onColorModeChange(option.value)}
              icon={option.icon}
              label={option.label}
            />
          ))}
        </div>
      </Section>

      <Section title="Effects">
        <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/5 p-3">
          <label className="flex items-center justify-between text-sm text-white/80">
            Animated background
            <Switch
              checked={settings.backgroundEnabled}
              onCheckedChange={onBackgroundEnabledChange}
            />
          </label>
          <label className="flex items-center justify-between text-sm text-white/80">
            Cursor glow
            <Switch
              checked={settings.cursorGlowEnabled}
              onCheckedChange={onCursorGlowEnabledChange}
            />
          </label>
        </div>
      </Section>
    </div>
  )
}
