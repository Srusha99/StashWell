"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { Laptop, Moon, Plus, Sun, Trash2, Waves } from "lucide-react"

import { cn } from "@/lib/utils"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import type { AppearanceSettings, BackgroundColorMode } from "@/hooks/use-appearance-settings"
import type { CustomBackgroundKind } from "@/lib/custom-background-store"

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Laptop },
] as const

const BACKGROUND_OPTIONS: { value: BackgroundColorMode; label: string; icon: typeof Waves }[] = [
  { value: "molten", label: "Molten", icon: Waves },
]

interface CustomBackgroundItem {
  id: string
  url: string
  kind: CustomBackgroundKind
  name: string
}

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
  customBackgrounds,
  onUploadCustomBackground,
  onSelectCustomBackground,
  onDeleteCustomBackground,
  onGreetingNameChange,
  onGreetingEnabledChange,
}: {
  settings: AppearanceSettings
  onColorModeChange: (mode: BackgroundColorMode) => void
  onBackgroundEnabledChange: (enabled: boolean) => void
  onCursorGlowEnabledChange: (enabled: boolean) => void
  customBackgrounds: CustomBackgroundItem[]
  onUploadCustomBackground: (file: File) => void
  onSelectCustomBackground: (id: string) => void
  onDeleteCustomBackground: (id: string) => void
  onGreetingNameChange: (name: string) => void
  onGreetingEnabledChange: (enabled: boolean) => void
}) {
  const { theme, setTheme } = useTheme()
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) onUploadCustomBackground(file)
    event.target.value = ""
  }

  return (
    <div className="flex max-w-md flex-col gap-6">
      <Section title="Greeting" description="Personalize the welcome line shown on the dashboard.">
        <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/5 p-3">
          <label className="flex items-center justify-between text-sm text-white/80">
            Show greeting
            <Switch
              checked={settings.greetingEnabled}
              onCheckedChange={onGreetingEnabledChange}
            />
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-white/50">Your name</span>
            <Input
              value={settings.greetingName}
              onChange={(event) => onGreetingNameChange(event.target.value)}
              placeholder="Enter your name"
              disabled={!settings.greetingEnabled}
              maxLength={40}
            />
          </div>
        </div>
      </Section>

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

      <Section title="Background style" description="Use the animated background, or upload your own images and videos.">
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

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={handleFileChange}
        />

        <div className="grid grid-cols-4 gap-2">
          {customBackgrounds.map((item) => {
            const active = settings.colorMode === "custom" && settings.customBackgroundId === item.id
            return (
              <div key={item.id} className="group relative aspect-square">
                <button
                  type="button"
                  onClick={() => onSelectCustomBackground(item.id)}
                  className={cn(
                    "size-full overflow-hidden rounded-lg border transition-colors",
                    active ? "border-white/60" : "border-white/10 hover:border-white/30"
                  )}
                >
                  {item.kind === "video" ? (
                    <video src={item.url} className="size-full object-cover" muted playsInline />
                  ) : (
                    <img src={item.url} alt={item.name} className="size-full object-cover" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteCustomBackground(item.id)}
                  className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-md bg-black/70 text-white/80 opacity-0 transition-opacity group-hover:opacity-100 hover:text-white"
                  aria-label={`Remove ${item.name}`}
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            )
          })}

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/20 text-white/50 transition-colors hover:border-white/40 hover:text-white/80"
          >
            <Plus className="size-4" />
            <span className="text-[0.65rem]">Add</span>
          </button>
        </div>
      </Section>

      <Section title="Effects">
        <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/5 p-3">
          <label
            className={cn(
              "flex items-center justify-between text-sm",
              settings.colorMode === "custom" ? "text-white/40" : "text-white/80"
            )}
          >
            <span>
              Animated background
              {settings.colorMode === "custom" && (
                <span className="ml-1.5 text-xs text-white/30">(not used with Custom)</span>
              )}
            </span>
            <Switch
              checked={settings.backgroundEnabled}
              onCheckedChange={onBackgroundEnabledChange}
              disabled={settings.colorMode === "custom"}
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
