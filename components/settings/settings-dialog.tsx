"use client"

import * as React from "react"
import { Bookmark, Layers, Palette, SlidersHorizontal } from "lucide-react"

import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { GeneralSettings } from "@/components/settings/general-settings"
import { AppearanceSettingsPanel } from "@/components/settings/appearance-settings"
import { BookmarkManager } from "@/components/bookmarks/bookmark-manager"
import { WorkspacesSettings } from "@/components/workspaces/workspaces-settings"
import { Group, PaneHeader } from "@/components/settings/settings-parts"
import type { useAppearanceSettings } from "@/hooks/use-appearance-settings"
import type { CustomBackgroundKind } from "@/lib/custom-background-store"

interface CustomBackgroundItem {
  id: string
  url: string
  kind: CustomBackgroundKind
  name: string
}

export type SettingsSection =
  "general" | "appearance" | "workspaces" | "bookmarks"

const SECTIONS: { id: SettingsSection; label: string; icon: typeof Palette }[] =
  [
    { id: "general", label: "General", icon: SlidersHorizontal },
    { id: "appearance", label: "Appearance", icon: Palette },
    { id: "workspaces", label: "Workspaces", icon: Layers },
    { id: "bookmarks", label: "Bookmarks", icon: Bookmark },
  ]

/**
 * Every setting in one place: a section rail on the left, the section's own pane
 * on the right. The Bookmarks section is the whole bookmark organiser, which used
 * to be a full-screen view of its own.
 *
 * Rendered from AppContent, over the dashboard, so it can read the appearance
 * settings and the active workspace without the dashboard threading them through.
 * `section` is controlled from there too: opening a folder card has to land on
 * Bookmarks at that folder.
 */
export function SettingsDialog({
  open,
  onOpenChange,
  section,
  onSectionChange,
  appearance,
  customBackgrounds,
  onUploadCustomBackground,
  onSelectCustomBackground,
  onDeleteCustomBackground,
  bookmarksFolderId,
  hiddenIds,
  onHideFolder,
  onUnhideFolder,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  section: SettingsSection
  onSectionChange: (section: SettingsSection) => void
  appearance: ReturnType<typeof useAppearanceSettings>
  customBackgrounds: CustomBackgroundItem[]
  onUploadCustomBackground: (file: File) => void
  onSelectCustomBackground: (id: string) => void
  onDeleteCustomBackground: (id: string) => void
  /** Folder the organiser should open at, e.g. the card that was clicked. */
  bookmarksFolderId: string | null
  hiddenIds: Set<string>
  onHideFolder: (id: string) => void
  onUnhideFolder: (id: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Sized for the section rail plus a single content column - the
          organiser lost its own inner sidebar, so nothing here needs the extra
          width that used to leave the other three sections half-empty.
          Capped in vh too, so it never outgrows a short window. */}
      <DialogContent className="flex h-[min(82vh,600px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[720px]">
        <header className="flex h-11 shrink-0 items-center border-b border-border px-4">
          <DialogTitle className="text-sm font-semibold">Settings</DialogTitle>
        </header>

        <div className="flex min-h-0 flex-1">
          <nav className="flex w-36 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border p-1.5">
            {SECTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSectionChange(item.id)}
                aria-current={section === item.id ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors",
                  section === item.id
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="size-3.5 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </nav>

          {/* The organiser manages its own scrolling in two panes, so it fills
              the section instead of sitting inside the scrolling column. */}
          {section === "bookmarks" ? (
            <BookmarkManager
              initialFolderId={bookmarksFolderId ?? undefined}
              hiddenIds={hiddenIds}
              onHideFolder={onHideFolder}
              onUnhideFolder={onUnhideFolder}
            />
          ) : (
            /* Keyed on the section so each pane mounts fresh, which also puts the
               scroll position back at the top on every switch. */
            <ScrollArea key={section} className="min-w-0 flex-1">
              <div className="w-full px-5 py-4">
                {section === "general" && (
                  <GeneralSettings
                    settings={appearance.settings}
                    onGreetingEnabledChange={appearance.setGreetingEnabled}
                    onGreetingNameChange={appearance.setGreetingName}
                    onSearchBarEnabledChange={appearance.setSearchBarEnabled}
                    onNotesEnabledChange={appearance.setNotesEnabled}
                    onRemindersEnabledChange={appearance.setRemindersEnabled}
                  />
                )}

                {section === "appearance" && (
                  <AppearanceSettingsPanel
                    settings={appearance.settings}
                    onColorModeChange={appearance.setColorMode}
                    onBackgroundEnabledChange={appearance.setBackgroundEnabled}
                    onCursorGlowEnabledChange={appearance.setCursorGlowEnabled}
                    customBackgrounds={customBackgrounds}
                    onUploadCustomBackground={onUploadCustomBackground}
                    onSelectCustomBackground={onSelectCustomBackground}
                    onDeleteCustomBackground={onDeleteCustomBackground}
                    onDailyWallpaperEnabledChange={
                      appearance.setDailyWallpaperEnabled
                    }
                    onCardFeelChange={appearance.setCardFeel}
                    onResetAppearance={appearance.resetAppearance}
                  />
                )}

                {section === "workspaces" && (
                  <div>
                    <PaneHeader
                      title="Workspaces"
                      description="Each workspace keeps its own bookmarks, notes, and reminders."
                    />
                    <Group>
                      <WorkspacesSettings listClassName="max-h-none" />
                    </Group>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
