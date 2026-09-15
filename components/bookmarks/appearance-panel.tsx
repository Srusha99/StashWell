"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { Flashlight, Laptop, Moon, Plus, Sparkles, Spline, Sun, Trash2, Waves, Wind } from "lucide-react"

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
  { value: "colorbends", label: "Color Bends", icon: Sparkles },
  { value: "webthreads", label: "Web Threads", icon: Spline },
  { value: "lightrays", label: "Light Rays", icon: Flashlight },
  { value: "softaurora", label: "Soft Aurora", icon: Wind },
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
          ? "border-black/10 bg-black/[0.05] text-[#1c1c1e] dark:border-white/20 dark:bg-white/10 dark:text-white"
          : "border-[#e5e5ea] bg-white text-[#8e8e93] hover:bg-black/[0.03] hover:text-[#1c1c1e] dark:border-white/10 dark:bg-white/5 dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white"
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
        <h3 className="text-sm font-medium text-[#1c1c1e] dark:text-white">{title}</h3>
        {description && <p className="text-xs text-[#8e8e93] dark:text-white/50">{description}</p>}
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
  onSearchBarEnabledChange,
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
  onSearchBarEnabledChange: (enabled: boolean) => void
}) {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const isLight = resolvedTheme === "light"
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) onUploadCustomBackground(file)
    event.target.value = ""
  }

  function handleBackgroundOptionClick(mode: BackgroundColorMode) {
    if (isLight) setTheme("dark")
    onColorModeChange(mode)
  }

  return (
    <div className="flex max-w-md flex-col gap-6">
      <Section title="Greeting" description="Personalize the welcome line shown on the dashboard.">
        <div className="flex flex-col gap-3 rounded-lg border border-[#e5e5ea] bg-white p-3 dark:border-white/10 dark:bg-white/5">
          <label className="flex items-center justify-between text-sm text-[#3c3c43] dark:text-white/80">
            Show greeting
            <Switch
              checked={settings.greetingEnabled}
              onCheckedChange={onGreetingEnabledChange}
            />
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-[#8e8e93] dark:text-white/50">Your name</span>
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

      <Section title="Search Bar" description="Show a Google search bar on the dashboard.">
        <div className="flex flex-col gap-3 rounded-lg border border-[#e5e5ea] bg-white p-3 dark:border-white/10 dark:bg-white/5">
          <label className="flex items-center justify-between text-sm text-[#3c3c43] dark:text-white/80">
            Show search bar
            <Switch
              checked={settings.searchBarEnabled}
              onCheckedChange={onSearchBarEnabledChange}
            />
          </label>
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
              active={!isLight && settings.colorMode === option.value}
              onClick={() => handleBackgroundOptionClick(option.value)}
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
            const active = !isLight && settings.colorMode === "custom" && settings.customBackgroundId === item.id
            return (
              <div key={item.id} className="group relative aspect-square">
                <button
                  type="button"
                  onClick={() => {
                    if (isLight) setTheme("dark")
                    onSelectCustomBackground(item.id)
                  }}
                  className={cn(
                    "size-full overflow-hidden rounded-lg border transition-colors",
                    active
                      ? "border-[#5227ff]/60 dark:border-white/60"
                      : "border-[#e5e5ea] hover:border-black/20 dark:border-white/10 dark:hover:border-white/30"
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
                  className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-md bg-black/60 text-white/90 opacity-0 transition-opacity group-hover:opacity-100 hover:text-white dark:bg-black/70 dark:text-white/80"
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
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[#e5e5ea] text-[#8e8e93] transition-colors hover:border-black/20 hover:text-[#1c1c1e] dark:border-white/20 dark:text-white/50 dark:hover:border-white/40 dark:hover:text-white/80"
          >
            <Plus className="size-4" />
            <span className="text-[0.65rem]">Add</span>
          </button>
        </div>
      </Section>

      <Section title="Effects">
        <div className="flex flex-col gap-3 rounded-lg border border-[#e5e5ea] bg-white p-3 dark:border-white/10 dark:bg-white/5">
          <label
            className={cn(
              "flex items-center justify-between text-sm",
              isLight || settings.colorMode === "custom"
                ? "text-[#8e8e93]/60 dark:text-white/40"
                : "text-[#3c3c43] dark:text-white/80"
            )}
          >
            <span>
              Animated background
              {!isLight && settings.colorMode === "custom" && (
                <span className="ml-1.5 text-xs text-[#8e8e93]/70 dark:text-white/30">(not used with Custom)</span>
              )}
              {isLight && (
                <span className="ml-1.5 text-xs text-[#8e8e93]/70 dark:text-white/30">(switches off Light theme)</span>
              )}
            </span>
            <Switch
              checked={!isLight && settings.backgroundEnabled}
              onCheckedChange={(enabled) => {
                if (isLight && enabled) setTheme("dark")
                onBackgroundEnabledChange(enabled)
              }}
              disabled={settings.colorMode === "custom"}
            />
          </label>
          <label className="flex items-center justify-between text-sm text-[#3c3c43] dark:text-white/80">
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
