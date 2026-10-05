"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { Check, Clapperboard, Plus, RotateCcw, Trash2 } from "lucide-react"

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
  ProBadge,
  Row,
  SegmentedControl,
} from "@/components/settings/settings-parts"
import { WallpaperLimitModal } from "@/components/settings/wallpaper-limit-modal"
import { ProUpgradeModal } from "@/components/dashboard/pro-upgrade-modal"
import { useIsPro } from "@/hooks/use-is-pro"
import {
  WALLPAPER_ACCEPT,
  WALLPAPER_LIMITS,
  canUploadWallpaper,
  describeSlotUsage,
} from "@/lib/wallpaper-gate"
import {
  type AppearanceSettings,
  type BackgroundColorMode,
  BOOKMARK_TEXT_SCALE,
} from "@/hooks/use-appearance-settings"
import { ROTATING_BUILT_INS } from "@/hooks/use-daily-wallpaper"
import type { CustomBackgroundKind } from "@/lib/custom-background-store"

interface CustomBackgroundItem {
  id: string
  url: string
  kind: CustomBackgroundKind
  name: string
}

const PRO_PITCH = `Pro gives you ${WALLPAPER_LIMITS.pro.slots} upload slots, video and GIF wallpapers, and a new wallpaper every day.`

const UPGRADE_PROMPTS = {
  video: {
    title: "Pro Feature: Live Video Wallpapers",
    description: `Set a video or animated GIF as your wallpaper. ${PRO_PITCH}`,
  },
  slideshow: {
    title: "Pro Feature: Daily Wallpaper Slideshow",
    description: `Wake up to a different wallpaper every day, cycling the built-ins and your uploads. ${PRO_PITCH}`,
  },
  slots: {
    title: "Upgrade to StashWell Pro",
    description: `Keep up to ${WALLPAPER_LIMITS.pro.slots} custom wallpapers instead of ${WALLPAPER_LIMITS.free.slots}. ${PRO_PITCH}`,
  },
} as const

type UpgradePrompt = keyof typeof UPGRADE_PROMPTS

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Couldn't save that wallpaper."
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
  onReplaceCustomBackground,
  onSelectCustomBackground,
  onDeleteCustomBackground,
  onDailyWallpaperEnabledChange,
  onCardFeelChange,
  onBookmarkTextScaleChange,
  onResetAppearance,
}: {
  settings: AppearanceSettings
  onColorModeChange: (mode: BackgroundColorMode) => void
  onBackgroundEnabledChange: (enabled: boolean) => void
  onCursorGlowEnabledChange: (enabled: boolean) => void
  customBackgrounds: CustomBackgroundItem[]
  /** Rejects with a message to show if the upload can't be saved. */
  onUploadCustomBackground: (file: File) => Promise<void>
  onReplaceCustomBackground: (id: string, file: File) => Promise<void>
  onSelectCustomBackground: (id: string) => void
  onDeleteCustomBackground: (id: string) => void
  onDailyWallpaperEnabledChange: (enabled: boolean) => void
  onCardFeelChange: (patch: Partial<CardFeel>) => void
  onBookmarkTextScaleChange: (percent: number) => void
  onResetAppearance: () => void
}) {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const isLight = resolvedTheme === "light"
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const rotationPoolSize = ROTATING_BUILT_INS.length + customBackgrounds.length
  const isPro = useIsPro()
  const [uploadError, setUploadError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  // A file waiting on the "slots full" choice: replace, or upgrade.
  const [pendingFile, setPendingFile] = React.useState<File | null>(null)
  const [upgradePrompt, setUpgradePrompt] = React.useState<UpgradePrompt | null>(null)

  // "Replace Current Wallpaper": the upload on screen now, or else the newest.
  const replaceTarget =
    customBackgrounds.find(
      (item) => settings.colorMode === "custom" && item.id === settings.customBackgroundId
    ) ??
    customBackgrounds.at(-1) ??
    null

  // A wallpaper being on means no plain theme is selected, so the pill shows
  // nothing highlighted rather than claiming Dark.
  const activeTheme: ThemeValue | null = settings.backgroundEnabled
    ? null
    : ((theme ?? "system") as ThemeValue)

  async function save(work: () => Promise<void>) {
    setBusy(true)
    try {
      await work()
    } catch (error) {
      setUploadError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    setUploadError(null)

    const gate = canUploadWallpaper(isPro, customBackgrounds.length, file)
    if (gate.allowed) {
      if (isLight) setTheme("dark")
      void save(() => onUploadCustomBackground(file))
    } else if (gate.reason === "slots-full" && replaceTarget) {
      setPendingFile(file)
    } else if (gate.reason === "pro-format") {
      setUpgradePrompt("video")
    } else {
      setUploadError(gate.message)
    }
  }

  function handleReplace() {
    const file = pendingFile
    const target = replaceTarget
    setPendingFile(null)
    if (!file || !target) return
    if (isLight) setTheme("dark")
    void save(() => onReplaceCustomBackground(target.id, file))
  }

  function handleDailyWallpaperChange(enabled: boolean) {
    if (!isPro) {
      setUpgradePrompt("slideshow")
      return
    }
    onDailyWallpaperEnabledChange(enabled)
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
              accept={WALLPAPER_ACCEPT}
              className="hidden"
              onChange={handleFileChange}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="flex aspect-video flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground disabled:opacity-50"
            >
              <Plus className="size-4" />
              <span className="text-[0.7rem] font-medium">
                {busy ? "Saving…" : isPro ? "Add your own" : "Add an image"}
              </span>
            </button>

            {/* Videos are Pro, so on Free they get a tile of their own that
                says so, rather than failing quietly inside the file picker. */}
            {!isPro && (
              <button
                type="button"
                onClick={() => setUpgradePrompt("video")}
                className="relative flex aspect-video flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
              >
                {/* Cornered like the selected tile's check, so the label
                    below stays on one line however narrow the tile gets. */}
                <ProBadge className="absolute top-1.5 right-1.5" />
                <Clapperboard className="size-4" />
                <span className="text-[0.7rem] font-medium whitespace-nowrap">Add a video</span>
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
            <span>
              {describeSlotUsage(isPro, customBackgrounds.length)}
              {isPro
                ? " - images, videos and GIFs up to 100 MB"
                : " - JPG, PNG or WebP up to 5 MB"}
            </span>
            {!isPro && (
              <button
                type="button"
                onClick={() => setUpgradePrompt("slots")}
                className="shrink-0 font-medium text-emerald-600 hover:underline dark:text-emerald-400"
              >
                Get {WALLPAPER_LIMITS.pro.slots} slots
              </button>
            )}
          </div>

          {uploadError && (
            <p role="alert" className="text-[11px] text-destructive">
              {uploadError}
            </p>
          )}

          <Row
            label={
              <span className="flex items-center gap-1.5">
                New wallpaper each day {!isPro && <ProBadge />}
              </span>
            }
            hint={
              isPro
                ? `Switches at midnight, cycling ${rotationPoolSize}: ${ROTATING_BUILT_INS.length} built-in + ${customBackgrounds.length} uploaded.`
                : "A slideshow that switches your wallpaper at midnight."
            }
            control={
              <Switch
                checked={isPro && settings.dailyWallpaperEnabled}
                onCheckedChange={handleDailyWallpaperChange}
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

        <WallpaperLimitModal
          open={pendingFile !== null}
          onOpenChange={(open) => {
            if (!open) setPendingFile(null)
          }}
          isPro={isPro}
          fileName={pendingFile?.name ?? ""}
          replaceName={replaceTarget?.name ?? ""}
          busy={busy}
          onReplace={handleReplace}
          onUpgrade={() => {
            setPendingFile(null)
            setUpgradePrompt("slots")
          }}
        />

        <ProUpgradeModal
          open={upgradePrompt !== null}
          onOpenChange={(open) => {
            if (!open) setUpgradePrompt(null)
          }}
          title={upgradePrompt ? UPGRADE_PROMPTS[upgradePrompt].title : undefined}
          description={upgradePrompt ? UPGRADE_PROMPTS[upgradePrompt].description : undefined}
        />

        <Group title="Text size">
          <Row
            stacked
            label="Bookmark names"
            hint="How large bookmark names appear in the dashboard cards."
            control={
              <Slider
                label="Bookmark name size"
                value={settings.bookmarkTextScale}
                min={BOOKMARK_TEXT_SCALE.min}
                max={BOOKMARK_TEXT_SCALE.max}
                step={1}
                // Keeps the floating value inside the card at either end.
                thumbAlignment="edge"
                valueLabel={(percent) => `${percent}%`}
                onValueChange={(value) =>
                  onBookmarkTextScaleChange(value as number)
                }
              />
            }
          />
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
