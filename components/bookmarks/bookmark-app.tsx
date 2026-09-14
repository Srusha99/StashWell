"use client"

import * as React from "react"

import MoltenMetal from "@/components/MoltenMetal"
import GlowCursor from "@/components/GlowCursor"
import { BOOKMARKS_BAR_ID } from "@/hooks/use-bookmarks"
import { useAppearanceSettings } from "@/hooks/use-appearance-settings"
import { DashboardView } from "@/components/bookmarks/dashboard-view"
import { BookmarkManager } from "@/components/bookmarks/bookmark-manager"
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
  const appearance = useAppearanceSettings()
  const { settings, setColorMode, setCustomBackgroundId } = appearance
  const [customBackgrounds, setCustomBackgrounds] = React.useState<CustomBackgroundItem[]>([])
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
    })
    return () => {
      items.forEach((item) => URL.revokeObjectURL(item.url))
    }
  }, [])

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

  function openManager(folderId: string) {
    setManagerTab("manager")
    setManagerFolderId(folderId)
  }

  function openSettings() {
    setManagerTab("manager")
    setManagerFolderId(BOOKMARKS_BAR_ID)
  }

  const content =
    managerFolderId !== null ? (
      <BookmarkManager
        initialFolderId={managerFolderId}
        initialTab={managerTab}
        onBack={() => setManagerFolderId(null)}
        appearance={appearance}
        customBackgrounds={customBackgrounds}
        onUploadCustomBackground={handleCustomBackgroundUpload}
        onSelectCustomBackground={handleSelectCustomBackground}
        onDeleteCustomBackground={handleDeleteCustomBackground}
      />
    ) : (
      <DashboardView
        onOpenManager={openManager}
        onOpenSettings={openSettings}
        greetingName={settings.greetingName}
        greetingEnabled={settings.greetingEnabled}
      />
    )

  return (
    <div className="relative h-screen w-screen text-foreground">
      <div className="fixed inset-0 -z-10 bg-background">
        {(settings.colorMode === "custom" ? Boolean(activeCustomBackground) : settings.backgroundEnabled) &&
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

      {settings.cursorGlowEnabled ? (
        <GlowCursor color="#67E8F9" secondaryColor="#A78BFA">
          {content}
        </GlowCursor>
      ) : (
        content
      )}
    </div>
  )
}
