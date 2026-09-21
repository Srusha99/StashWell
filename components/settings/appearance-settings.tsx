"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { Check, Plus, RotateCcw, Trash2 } from "lucide-react"

import {
  CARD_FEEL_KEYS,
  CARD_FEEL_LABELS,
  type CardFeel,
} from "@/lib/card-feel"
import { WALLPAPER_PRESETS } from "@/lib/wallpapers"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import {
  Group,
  PaneHeader,
  Row,
  SegmentedControl,
} from "@/components/settings/settings-parts"
import type {
  AppearanceSettings,
  BackgroundColorMode,
} from "@/hooks/use-appearance-settings"
import { ROTATING_BUILT_INS } from "@/hooks/use-daily-wallpaper"
import type { CustomBackgroundKind } from "@/lib/custom-background-store"

interface CustomBackgroundItem {
  id: string
  url: string
  kind: CustomBackgroundKind
  name: string
}

/** "system" is next-themes' name for it; "Auto" is what the pill says. */
const THEME_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "Auto" },
] as const

type ThemeValue = (typeof THEME_OPTIONS)[number]["value"]

export function AppearanceSettingsPanel({
  settings,
  onColorModeChange,
  onBackgroundEnabledChange,
  onCursorGlowEnabledChange,
  customBackgrounds,
  onUploadCustomBackground,
  onSelectCustomBackground,
  onDeleteCustomBackground,
  onDailyWallpaperEnabledChange,
  onCardFeelChange,
  onResetAppearance,
}: {
  settings: AppearanceSettings
  onColorModeChange: (mode: BackgroundColorMode) => void
  onBackgroundEnabledChange: (enabled: boolean) => void
  onCursorGlowEnabledChange: (enabled: boolean) => void
  customBackgrounds: CustomBackgroundItem[]
  onUploadCustomBackground: (file: File) => void
  onSelectCustomBackground: (id: string) => void
  onDeleteCustomBackground: (id: string) => void
  onDailyWallpaperEnabledChange: (enabled: boolean) => void
  onCardFeelChange: (patch: Partial<CardFeel>) => void
  onResetAppearance: () => void
}) {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const isLight = resolvedTheme === "light"
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const rotationPoolSize = ROTATING_BUILT_INS.length + customBackgrounds.length

  // A wallpaper being on means no plain theme is selected, so the pill shows
  // nothing highlighted rather than claiming Dark.
  const activeTheme: ThemeValue | null = settings.backgroundEnabled
    ? null
    : ((theme ?? "system") as ThemeValue)

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) onUploadCustomBackground(file)
    event.target.value = ""
  }

  // Picking a theme means the plain flat theme: Dark is a solid dark UI, not
  // dark-plus-whatever-wallpaper-was-last-selected. Choose a wallpaper again
  // below to bring one back.
  function handleThemeChange(value: ThemeValue) {
    setTheme(value)
    onBackgroundEnabledChange(false)
  }

  function handlePresetClick(mode: BackgroundColorMode) {
    if (isLight) setTheme("dark")
    onColorModeChange(mode)
  }

  function handleUploadClick(id: string) {
    if (isLight) setTheme("dark")
    onSelectCustomBackground(id)
  }

  function handleReset() {
    setTheme("system")
    onResetAppearance()
  }

  return (
    <div>
      <PaneHeader
        title="Appearance"
        description="Make it yours. Every setting is live."
        action={
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={handleReset}
          >
            <RotateCcw /> Reset to defaults
          </Button>
        }
      />

      <div className="flex flex-col gap-4">
        <Group>
          <Row
            label="Theme"
            hint="Auto follows your system setting."
            control={
              <SegmentedControl
                options={THEME_OPTIONS}
                value={activeTheme}
                onChange={handleThemeChange}
              />
            }
          />
        </Group>

        <Group
          title="Wallpaper"
          description="A built-in background, or your own images and videos."
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {WALLPAPER_PRESETS.map((preset) => (
              <WallpaperTile
                key={preset.id}
                label={preset.label}
                active={
                  !isLight &&
                  settings.backgroundEnabled &&
                  settings.colorMode === preset.id
                }
                onClick={() => handlePresetClick(preset.id)}
              >
                {preset.preview.kind === "video" ? (
                  <video
                    src={preset.preview.src}
                    className="size-full object-cover"
                    muted
                    playsInline
                  />
                ) : (
                  <div
                    className="size-full"
                    style={{ background: preset.preview.value }}
                  />
                )}
              </WallpaperTile>
            ))}

            {customBackgrounds.map((item) => (
              <WallpaperTile
                key={item.id}
                label={item.name}
                active={
                  !isLight &&
                  settings.backgroundEnabled &&
                  settings.colorMode === "custom" &&
                  settings.customBackgroundId === item.id
                }
                onClick={() => handleUploadClick(item.id)}
                onDelete={() => onDeleteCustomBackground(item.id)}
              >
                {item.kind === "video" ? (
                  <video
                    src={item.url}
                    className="size-full object-cover"
                    muted
                    playsInline
                  />
                ) : (
                  <img
                    src={item.url}
                    alt=""
                    className="size-full object-cover"
                  />
                )}
              </WallpaperTile>
            ))}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={handleFileChange}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex aspect-video flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              <Plus className="size-4" />
              <span className="text-[0.7rem] font-medium">Add your own</span>
            </button>
          </div>

          <Row
            label="New wallpaper each day"
            hint={`Switches at midnight, cycling ${rotationPoolSize}: ${ROTATING_BUILT_INS.length} built-in + ${customBackgrounds.length} uploaded.`}
            control={
              <Switch
                checked={settings.dailyWallpaperEnabled}
                onCheckedChange={onDailyWallpaperEnabledChange}
              />
            }
          />
        </Group>

        <Group title="Effects">
          <Row
            label="Show background"
            hint={isLight ? "Switches off the Light theme." : undefined}
            disabled={isLight}
            control={
              <Switch
                checked={!isLight && settings.backgroundEnabled}
                onCheckedChange={(enabled) => {
                  if (isLight && enabled) setTheme("dark")
                  onBackgroundEnabledChange(enabled)
                }}
              />
            }
          />
          <Row
            label="Cursor glow"
            control={
              <Switch
                checked={settings.cursorGlowEnabled}
                onCheckedChange={onCursorGlowEnabledChange}
              />
            }
          />
        </Group>

        <Group
          title="Card feel"
          description="How the dashboard cards sit over your background. Lower the blur and opacity to let more of it through."
        >
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 py-1 sm:grid-cols-2">
            {CARD_FEEL_KEYS.map((key) => (
              <div key={key} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between">
                  <span className="text-[13px] text-foreground">
                    {CARD_FEEL_LABELS[key]}
                  </span>
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {Math.round(settings[key])}%
                  </span>
                </div>
                <Slider
                  label={CARD_FEEL_LABELS[key]}
                  value={settings[key]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={(value) =>
                    onCardFeelChange({ [key]: value as number })
                  }
                />
              </div>
            ))}
          </div>
        </Group>
      </div>
    </div>
  )
}

function WallpaperTile({
  label,
  active,
  onClick,
  onDelete,
  children,
}: {
  label: string
  active: boolean
  onClick: () => void
  onDelete?: () => void
  children: React.ReactNode
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={cn(
          "relative block aspect-video w-full overflow-hidden rounded-xl border transition-colors",
          active
            ? "border-primary ring-2 ring-primary/40"
            : "border-border hover:border-foreground/25"
        )}
      >
        {children}
        <span className="absolute bottom-1.5 left-1.5 max-w-[calc(100%-0.75rem)] truncate rounded-md bg-black/55 px-1.5 py-0.5 text-[0.65rem] font-medium text-white">
          {label}
        </span>
      </button>

      {active && (
        <span className="pointer-events-none absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-3" />
        </span>
      )}

      {/* Top-left so it stays reachable on the selected tile, where the check
          badge occupies the opposite corner. */}
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="absolute top-1.5 left-1.5 flex size-5 items-center justify-center rounded-md bg-black/60 text-white/90 opacity-0 transition-opacity group-hover:opacity-100 hover:text-white"
          aria-label={`Remove ${label}`}
        >
          <Trash2 className="size-3" />
        </button>
      )}
    </div>
  )
}
