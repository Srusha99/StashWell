"use client"

import * as React from "react"
import { useTheme } from "next-themes"

import MoltenMetal from "@/components/MoltenMetal"
import ColorBends from "@/components/ColorBends"
import WebThreads from "@/components/WebThreads"
import LightRays from "@/components/LightRays"
import SoftAurora from "@/components/SoftAurora"
import GlowCursor from "@/components/GlowCursor"
import { useAppearanceSettings } from "@/hooks/use-appearance-settings"
import { useColumnCount } from "@/hooks/use-column-count"
import { useDailyWallpaper } from "@/hooks/use-daily-wallpaper"
import { DashboardView } from "@/components/bookmarks/dashboard-view"
import { BookmarkManager } from "@/components/bookmarks/bookmark-manager"
import { WorkspaceProvider, useWorkspaces } from "@/components/workspaces/workspace-provider"
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
  const [managerFolderId, setManagerFolderId] = React.useState<string | null>(null)
  const [managerTab, setManagerTab] = React.useState<"manager" | "appearance">("manager")
  // Hoisted above the workspace key boundary on purpose: useColumnCount starts
  // at 1 to match the static-export markup and only reaches the real count in an
  // effect, so remounting it on every workspace switch would flash a
  // single-column dashboard each time.
  const columnCount = useColumnCount()
  const { resolvedTheme } = useTheme()
  const isLight = resolvedTheme === "light"
  const appearance = useAppearanceSettings()
  const { settings, setColorMode, setCustomBackgroundId } = appearance
  const [customBackgrounds, setCustomBackgrounds] = React.useState<CustomBackgroundItem[]>([])
  const [customBackgroundsLoaded, setCustomBackgroundsLoaded] = React.useState(false)
  const activeCustomBackground =
    customBackgrounds.find((item) => item.id === settings.customBackgroundId) ?? null

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
      managerFolderId={managerFolderId}
      managerTab={managerTab}
      columnCount={columnCount}
      onOpenManager={(folderId) => {
        setManagerTab("manager")
        setManagerFolderId(folderId)
      }}
      onOpenSettings={(folderId) => {
        setManagerTab("manager")
        setManagerFolderId(folderId)
      }}
      onBack={() => setManagerFolderId(null)}
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
              <img src={activeCustomBackground.url} alt="" className="size-full object-cover" />
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
          ) : settings.colorMode === "webthreads" ? (
            <WebThreads
              color1="#5227FF"
              color2="#FF9FFC"
              color3="#FFFFFF"
              speed={0.05}
              threadCount={6}
              frequency={5.0}
              spread={0.17}
              taper={1.0}
              position={0.5}
              fanMode="center"
              glow={0.02}
              falloff={0.6}
              thickness={0.7}
              brightness={0.6}
              opacity={1.0}
              mirror={true}
              shimmer={false}
              grain={true}
              grainIntensity={0.01}
              mouseInteraction={true}
              mouseStrength={0.3}
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
          workspace switch never restarts the WebGL wallpaper. managerFolderId
          lives out here, outside the keyed subtree, so it has to be dropped on a
          switch - a folder id from one workspace means nothing in another. */}
      <WorkspaceProvider onWorkspaceChange={() => setManagerFolderId(null)}>
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
  managerFolderId,
  managerTab,
  columnCount,
  onOpenManager,
  onOpenSettings,
  onBack,
  appearance,
  customBackgrounds,
  onUploadCustomBackground,
  onSelectCustomBackground,
  onDeleteCustomBackground,
}: {
  managerFolderId: string | null
  managerTab: "manager" | "appearance"
  columnCount: number
  onOpenManager: (folderId: string) => void
  onOpenSettings: (folderId: string) => void
  onBack: () => void
  appearance: ReturnType<typeof useAppearanceSettings>
  customBackgrounds: CustomBackgroundItem[]
  onUploadCustomBackground: (file: File) => void
  onSelectCustomBackground: (id: string) => void
  onDeleteCustomBackground: (id: string) => void
}) {
  const { activeId, activeWorkspace } = useWorkspaces()
  const { settings } = appearance

  return (
    <React.Fragment key={activeId}>
      {managerFolderId !== null ? (
        <BookmarkManager
          initialFolderId={managerFolderId}
          initialTab={managerTab}
          onBack={onBack}
          appearance={appearance}
          customBackgrounds={customBackgrounds}
          onUploadCustomBackground={onUploadCustomBackground}
          onSelectCustomBackground={onSelectCustomBackground}
          onDeleteCustomBackground={onDeleteCustomBackground}
        />
      ) : (
        <DashboardView
          columnCount={columnCount}
          onOpenManager={onOpenManager}
          // The manager opens at the workspace's own root, not the Bookmarks
          // Bar - id "1" sits outside every non-default workspace's subtree.
          onOpenSettings={() => onOpenSettings(activeWorkspace.folderId)}
          greetingName={settings.greetingName}
          greetingEnabled={settings.greetingEnabled}
          searchBarEnabled={settings.searchBarEnabled}
        />
      )}
    </React.Fragment>
  )
}
