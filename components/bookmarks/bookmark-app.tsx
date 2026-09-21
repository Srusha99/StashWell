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
import { useDailyWallpaper } from "@/hooks/use-daily-wallpaper"
import { useHiddenFolders } from "@/hooks/use-hidden-folders"
import { DashboardView } from "@/components/bookmarks/dashboard-view"
import {
  SettingsDialog,
  type SettingsSection,
} from "@/components/settings/settings-dialog"
import {
  WorkspaceProvider,
  useWorkspaces,
} from "@/components/workspaces/workspace-provider"
import {
  deleteCustomBackground,
  listCustomBackgrounds,
  saveCustomBackground,
  type CustomBackgroundKind,
} from "@/lib/custom-background-store"

interface CustomBackgroundItem {
  id: string
  url: string
  kind: CustomBackgroundKind
  name: string
}

export function BookmarkApp() {
  // Hoisted above the workspace key boundary on purpose: useColumnCount starts
  // at 1 to match the static-export markup and only reaches the real count in an
  // effect, so remounting it on every workspace switch would flash a
  // single-column dashboard each time.
  const columnCount = useColumnCount()
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
    listCustomBackgrounds().then((records) => {
      items = records.map((record) => ({
        id: record.id,
        url: URL.createObjectURL(record.blob),
        kind: record.kind,
        name: record.name,
      }))
      setCustomBackgrounds(items)
      setCustomBackgroundsLoaded(true)
    })
    return () => {
      items.forEach((item) => URL.revokeObjectURL(item.url))
    }
  }, [])

  const customBackgroundIds = React.useMemo(
    () => customBackgrounds.map((item) => item.id),
    [customBackgrounds]
  )

  useDailyWallpaper({
    settings,
    customBackgroundIds,
    customBackgroundsLoaded,
    applyDailyWallpaper: appearance.applyDailyWallpaper,
  })

  async function handleCustomBackgroundUpload(file: File) {
    const record = await saveCustomBackground(file)
    const item: CustomBackgroundItem = {
      id: record.id,
      url: URL.createObjectURL(record.blob),
      kind: record.kind,
      name: record.name,
    }
    setCustomBackgrounds((current) => [...current, item])
    setColorMode("custom")
    setCustomBackgroundId(item.id)
  }

  function handleSelectCustomBackground(id: string) {
    setColorMode("custom")
    setCustomBackgroundId(id)
  }

  async function handleDeleteCustomBackground(id: string) {
    await deleteCustomBackground(id)
    const removed = customBackgrounds.find((item) => item.id === id)
    if (removed) URL.revokeObjectURL(removed.url)

    const remaining = customBackgrounds.filter((item) => item.id !== id)
    setCustomBackgrounds(remaining)

    if (settings.customBackgroundId === id) {
      const fallback = remaining[0] ?? null
      setCustomBackgroundId(fallback?.id ?? null)
      if (!fallback) setColorMode("molten")
    }
  }

  const content = (
    <AppContent
      columnCount={columnCount}
      appearance={appearance}
      customBackgrounds={customBackgrounds}
      onUploadCustomBackground={handleCustomBackgroundUpload}
      onSelectCustomBackground={handleSelectCustomBackground}
      onDeleteCustomBackground={handleDeleteCustomBackground}
    />
  )

  return (
    <div className="relative h-screen w-screen text-foreground">
      <div className="fixed inset-0 -z-10 bg-background">
        {!isLight &&
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
 * the whole view on it: every per-workspace hook (bookmarks, notes, reminders,
 * hidden folders, card layout) then re-initializes from its lazy useState
 * initializer on a switch, instead of each having to react to an id change.
 * useCardColumns in particular depends on this - see its dev-mode guard.
 */
function AppContent({
  columnCount,
  appearance,
  customBackgrounds,
  onUploadCustomBackground,
  onSelectCustomBackground,
  onDeleteCustomBackground,
}: {
  columnCount: number
  appearance: ReturnType<typeof useAppearanceSettings>
  customBackgrounds: CustomBackgroundItem[]
  onUploadCustomBackground: (file: File) => void
  onSelectCustomBackground: (id: string) => void
  onDeleteCustomBackground: (id: string) => void
}) {
  const { activeId } = useWorkspaces()
  const { settings } = appearance
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [settingsSection, setSettingsSection] =
    React.useState<SettingsSection>("general")
  // Which folder the organiser opens at. Null means the workspace root.
  const [bookmarksFolderId, setBookmarksFolderId] = React.useState<
    string | null
  >(null)
  // Owned here, not in each view: Settings can unhide a folder while the
  // dashboard is behind it, and two useHiddenFolders instances would not see
  // each other's writes until one of them remounted.
  const { hiddenIds, hideFolder, unhideFolder } = useHiddenFolders(activeId)

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
        onOpenManager={openBookmarks}
        onOpenSettings={() => setSettingsOpen(true)}
        hiddenIds={hiddenIds}
        onHideFolder={hideFolder}
        greetingName={settings.greetingName}
        greetingEnabled={settings.greetingEnabled}
        searchBarEnabled={settings.searchBarEnabled}
        notesEnabled={settings.notesEnabled}
        remindersEnabled={settings.remindersEnabled}
      />

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        section={settingsSection}
        onSectionChange={setSettingsSection}
        appearance={appearance}
        customBackgrounds={customBackgrounds}
        onUploadCustomBackground={onUploadCustomBackground}
        onSelectCustomBackground={onSelectCustomBackground}
        onDeleteCustomBackground={onDeleteCustomBackground}
        bookmarksFolderId={bookmarksFolderId}
        hiddenIds={hiddenIds}
        onHideFolder={hideFolder}
        onUnhideFolder={unhideFolder}
      />
    </React.Fragment>
  )
}
