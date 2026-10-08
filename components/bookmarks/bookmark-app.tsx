"use client"

import * as React from "react"
import { useTheme } from "next-themes"

import MoltenMetal from "@/components/MoltenMetal"
import ColorBends from "@/components/ColorBends"
import LightRays from "@/components/LightRays"
import SoftAurora from "@/components/SoftAurora"
import GlowCursor from "@/components/GlowCursor"
import { useAppearanceSettings } from "@/hooks/use-appearance-settings"
import { useColumnCount } from "@/hooks/use-column-count"
import { useBookmarkSyncPref, useDashboardSync } from "@/hooks/use-dashboard-sync"
import { useDailyWallpaper } from "@/hooks/use-daily-wallpaper"
import { useHiddenFolders } from "@/hooks/use-hidden-folders"
import { useWhatsNew } from "@/hooks/use-whats-new"
import { DashboardView } from "@/components/bookmarks/dashboard-view"
import { WhatsNewDialog } from "@/components/auth/whats-new-dialog"
import {
  SettingsDialog,
  type SettingsSection,
} from "@/components/settings/settings-dialog"
import {
  WorkspaceProvider,
  useWorkspaces,
} from "@/components/workspaces/workspace-provider"
import {
  countCustomBackgrounds,
  deleteCustomBackground,
  listCustomBackgrounds,
  replaceCustomBackground,
  saveCustomBackground,
  type CustomBackgroundKind,
  type CustomBackgroundRecord,
} from "@/lib/custom-background-store"
import { useIsPro } from "@/hooks/use-is-pro"
import { canReplaceWallpaper, canUploadWallpaper } from "@/lib/wallpaper-gate"
import { useAuth } from "@/lib/auth-context"

interface CustomBackgroundItem {
  id: string
  url: string
  kind: CustomBackgroundKind
  name: string
}

function toItem(record: CustomBackgroundRecord): CustomBackgroundItem {
  return {
    id: record.id,
    url: URL.createObjectURL(record.blob),
    kind: record.kind,
    name: record.name,
  }
}

export function BookmarkApp() {
  // Hoisted above the workspace key boundary on purpose: useColumnCount starts
  // at 1 to match the static-export markup and only reaches the real count in an
  // effect, so remounting it on every workspace switch would flash a
  // single-column dashboard each time.
  const { count: columnCount, isReady: columnCountReady } = useColumnCount()
  // Also hoisted above the workspace key: a switch mustn't restart syncing.
  // Saved sessions and live (instant) sync are Pro only (lib/bundle-gate.ts);
  // bookmarks follow this device's "Sync Bookmarks" setting.
  const { user } = useAuth()
  const isPro = useIsPro()
  const bookmarkSyncPref = useBookmarkSyncPref()
  useDashboardSync(user?.id ?? null, {
    syncSessions: isPro,
    bookmarks: bookmarkSyncPref,
    live: isPro,
  })
  const { resolvedTheme } = useTheme()
  const isLight = resolvedTheme === "light"
  const appearance = useAppearanceSettings()
  const { settings, setColorMode, setCustomBackgroundId } = appearance
  const [customBackgrounds, setCustomBackgrounds] = React.useState<
    CustomBackgroundItem[]
  >([])
  const [customBackgroundsLoaded, setCustomBackgroundsLoaded] =
    React.useState(false)
  const activeCustomBackground =
    customBackgrounds.find((item) => item.id === settings.customBackgroundId) ??
    null

  React.useEffect(() => {
    let items: CustomBackgroundItem[] = []
    let active = true
    listCustomBackgrounds()
      .then((records) => {
        if (!active) return
        items = records.map(toItem)
        setCustomBackgrounds(items)
      })
      .catch((error: unknown) => {
        // Built-in wallpapers still work; only the uploads are missing.
        console.warn("[StashWell] Couldn't load uploaded wallpapers:", error)
      })
      .finally(() => {
        if (active) setCustomBackgroundsLoaded(true)
      })
    return () => {
      active = false
      items.forEach((item) => URL.revokeObjectURL(item.url))
    }
  }, [])

  const customBackgroundIds = React.useMemo(
    () => customBackgrounds.map((item) => item.id),
    [customBackgrounds]
  )

  useDailyWallpaper({
    // The daily slideshow is Pro. The setting itself is kept, so it picks up
    // where it left off if the user upgrades.
    settings: isPro ? settings : { ...settings, dailyWallpaperEnabled: false },
    customBackgroundIds,
    customBackgroundsLoaded,
    applyDailyWallpaper: appearance.applyDailyWallpaper,
  })

  // Both reject with a message the Appearance panel shows as-is. The panel
  // checks the plan's limits first; this checks again against the stored
  // count, which also includes uploads made in another open tab.
  async function handleCustomBackgroundUpload(file: File) {
    const gate = canUploadWallpaper(isPro, await countCustomBackgrounds(), file)
    if (!gate.allowed) throw new Error(gate.message)

    const item = toItem(await saveCustomBackground(file))
    setCustomBackgrounds((current) => [...current, item])
    setColorMode("custom")
    setCustomBackgroundId(item.id)
  }

  async function handleReplaceCustomBackground(id: string, file: File) {
    const gate = canReplaceWallpaper(isPro, file)
    if (!gate.allowed) throw new Error(gate.message)

    const item = toItem(await replaceCustomBackground(id, file))
    setCustomBackgrounds((current) => {
      const previous = current.find((entry) => entry.id === item.id)
      if (previous) URL.revokeObjectURL(previous.url)
      return previous
        ? current.map((entry) => (entry.id === item.id ? item : entry))
        : [...current, item]
    })
    setColorMode("custom")
    setCustomBackgroundId(item.id)
  }

  function handleSelectCustomBackground(id: string) {
    setColorMode("custom")
    setCustomBackgroundId(id)
  }

  async function handleDeleteCustomBackground(id: string) {
    try {
      await deleteCustomBackground(id)
    } catch (error) {
      // Left showing, since it's still stored.
      console.warn("[StashWell] Couldn't remove an uploaded wallpaper:", error)
      return
    }
    const removed = customBackgrounds.find((item) => item.id === id)
    if (removed) URL.revokeObjectURL(removed.url)

    const remaining = customBackgrounds.filter((item) => item.id !== id)
    setCustomBackgrounds(remaining)

    if (settings.customBackgroundId === id) {
      const fallback = remaining[0] ?? null
      setCustomBackgroundId(fallback?.id ?? null)
      if (!fallback) setColorMode("lightrays")
    }
  }

  const content = (
    <AppContent
      columnCount={columnCount}
      columnCountReady={columnCountReady}
      appearance={appearance}
      customBackgrounds={customBackgrounds}
      onUploadCustomBackground={handleCustomBackgroundUpload}
      onReplaceCustomBackground={handleReplaceCustomBackground}
      onSelectCustomBackground={handleSelectCustomBackground}
      onDeleteCustomBackground={handleDeleteCustomBackground}
    />
  )

  return (
    <div className="relative h-screen w-screen text-foreground">
      <div className="fixed inset-0 -z-10 bg-background">
        {!isLight &&
          appearance.loaded &&
          settings.backgroundEnabled &&
          (settings.colorMode === "custom" ? (
            activeCustomBackground &&
            (activeCustomBackground.kind === "video" ? (
              <video
                src={activeCustomBackground.url}
                className="size-full object-cover"
                autoPlay
                loop
                muted
                playsInline
              />
            ) : (
              <img
                src={activeCustomBackground.url}
                alt=""
                className="size-full object-cover"
              />
            ))
          ) : settings.colorMode === "mist" ? (
            <video
              src="/backgrounds/mist-over-the-pines.mp4"
              className="size-full object-cover"
              autoPlay
              loop
              muted
              playsInline
            />
          ) : settings.colorMode === "colorbends" ? (
            <ColorBends
              rotation={90}
              speed={0.03}
              colors={["#5227FF", "#0d5fe6", "#151be3"]}
              transparent
              autoRotate={0}
              scale={1}
              frequency={1}
              warpStrength={1}
              mouseInfluence={1}
              parallax={0.5}
              noise={0.1}
              iterations={1}
              intensity={2}
              bandWidth={6}
            />
          ) : settings.colorMode === "lightrays" ? (
            <LightRays
              raysOrigin="top-center"
              raysColor="#5227FF"
              raysSpeed={0.5}
              lightSpread={1.3}
              rayLength={3}
              followMouse={true}
              mouseInfluence={0.1}
              noiseAmount={0}
              distortion={0}
              pulsating={false}
              fadeDistance={1}
              saturation={1}
            />
          ) : settings.colorMode === "softaurora" ? (
            <SoftAurora
              speed={0.3}
              scale={1.5}
              brightness={1.2}
              color1="#f7f7f7"
              color2="#e100ff"
              noiseFrequency={2.5}
              noiseAmplitude={1}
              bandHeight={0.75}
              bandSpread={0.3}
              octaveDecay={0.25}
              layerOffset={0}
              colorSpeed={0.6}
              enableMouseInteraction
              mouseInfluence={0.25}
            />
          ) : (
            <MoltenMetal
              color1="#362287"
              color2="#334abc"
              color3="#ffffff"
              speed={0.15}
              scale={4}
              detail={3}
              glow={2}
              coreSize={0.1}
              swirl={0.7}
              fold={-0.29}
              blackPoint={0.05}
              brightness={1.25}
              colorMode={settings.colorMode}
              grain
              grainIntensity={0.05}
              mouseInteraction={false}
              mouseStrength={0.3}
              opacity={1}
            />
          ))}
      </div>

      {/* The provider wraps the content rather than the background layer, so a
          workspace switch never restarts the WebGL wallpaper. */}
      <WorkspaceProvider>
        {settings.cursorGlowEnabled ? (
          <GlowCursor color="#67E8F9" secondaryColor="#A78BFA">
            {content}
          </GlowCursor>
        ) : (
          content
        )}
      </WorkspaceProvider>
    </div>
  )
}

/**
 * Lives inside WorkspaceProvider so it can read the active workspace, and keys
 * the whole view on it: every per-workspace hook (bookmarks, hidden folders,
 * card layout) then re-initializes from its lazy useState initializer on a
 * switch, instead of each having to react to an id change.
 * useCardColumns in particular depends on this - see its dev-mode guard.
 */
function AppContent({
  columnCount,
  columnCountReady,
  appearance,
  customBackgrounds,
  onUploadCustomBackground,
  onReplaceCustomBackground,
  onSelectCustomBackground,
  onDeleteCustomBackground,
}: {
  columnCount: number
  columnCountReady: boolean
  appearance: ReturnType<typeof useAppearanceSettings>
  customBackgrounds: CustomBackgroundItem[]
  onUploadCustomBackground: (file: File) => Promise<void>
  onReplaceCustomBackground: (id: string, file: File) => Promise<void>
  onSelectCustomBackground: (id: string) => void
  onDeleteCustomBackground: (id: string) => void
}) {
  const { activeId } = useWorkspaces()
  const { settings } = appearance
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [settingsSection, setSettingsSection] =
    React.useState<SettingsSection>("general")
  const { hasUnread, markSeen, showToast, dismissToast } = useWhatsNew()
  const [whatsNewOpen, setWhatsNewOpen] = React.useState(false)

  // Shared by the profile menu's "What's New" item and the dashboard toast -
  // either trigger both opens the dialog and marks it seen, which is also
  // what makes the toast disappear (its own visibility already depends on
  // "seen").
  function openWhatsNew() {
    setWhatsNewOpen(true)
    markSeen()
  }
  // Which folder the organiser opens at. Null means the workspace root.
  const [bookmarksFolderId, setBookmarksFolderId] = React.useState<
    string | null
  >(null)
  // Owned here, not in each view: Settings can unhide a folder while the
  // dashboard is behind it, and two useHiddenFolders instances would not see
  // each other's writes until one of them remounted.
  const { hiddenIds, hideFolder, unhideFolder, reloadHiddenFolders } =
    useHiddenFolders(activeId)

  // This state sits outside the workspace-keyed subtree below, so the folder id
  // has to be dropped on a switch - an id from one workspace means nothing in
  // another, and the organiser would open on a folder that isn't there.
  const [appliedWorkspaceId, setAppliedWorkspaceId] = React.useState(activeId)
  if (appliedWorkspaceId !== activeId) {
    setAppliedWorkspaceId(activeId)
    setBookmarksFolderId(null)
  }

  // The organiser lives in the Bookmarks section now, so opening a folder from
  // the dashboard means opening Settings there.
  function openBookmarks(folderId: string) {
    setBookmarksFolderId(folderId)
    setSettingsSection("bookmarks")
    setSettingsOpen(true)
  }

  return (
    <React.Fragment key={activeId}>
      <DashboardView
        columnCount={columnCount}
        columnCountReady={columnCountReady}
        onOpenManager={openBookmarks}
        onOpenSettings={() => setSettingsOpen(true)}
        hasUnread={hasUnread}
        onOpenWhatsNew={openWhatsNew}
        showWhatsNewToast={showToast}
        onDismissWhatsNewToast={dismissToast}
        hiddenIds={hiddenIds}
        onHideFolder={hideFolder}
        greetingName={settings.greetingName}
        greetingEnabled={settings.greetingEnabled}
        searchBarEnabled={settings.searchBarEnabled}
        use24HourClock={settings.use24HourClock}
      />

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        section={settingsSection}
        onSectionChange={setSettingsSection}
        appearance={appearance}
        customBackgrounds={customBackgrounds}
        onUploadCustomBackground={onUploadCustomBackground}
        onReplaceCustomBackground={onReplaceCustomBackground}
        onSelectCustomBackground={onSelectCustomBackground}
        onDeleteCustomBackground={onDeleteCustomBackground}
        bookmarksFolderId={bookmarksFolderId}
        hiddenIds={hiddenIds}
        onHideFolder={hideFolder}
        onUnhideFolder={unhideFolder}
        onReloadHiddenFolders={reloadHiddenFolders}
      />

      <WhatsNewDialog open={whatsNewOpen} onOpenChange={setWhatsNewOpen} />
    </React.Fragment>
  )
}
