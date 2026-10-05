"use client"

import * as React from "react"

import { Favicon } from "@/components/session-bundles/bundle-pill"
import {
  ShareTabsButton,
  TabSelectionHeader,
  shareCheckboxClass,
} from "@/components/session-bundles/tab-share-controls"
import { CARD, MUTED, TEXT } from "@/components/session-bundles/tones"
import { readCurrentWindowTabs, type SessionTab } from "@/lib/session-bundles"
import { cn } from "@/lib/utils"

/**
 * The popup's "Quick Share" panel: every open tab in this window with a
 * checkbox, all pre-checked, plus a one-click "Share" that copies whichever
 * tabs are still checked (see copyTabsWithTitles). Entirely in-memory -
 * nothing here is saved as a bundle or written to storage, and closing the
 * panel discards the selection.
 */
export function ShareTabsPanel() {
  const [tabs, setTabs] = React.useState<SessionTab[] | null>(null)
  const [selectedTabIds, setSelectedTabIds] = React.useState<Set<string>>(new Set())

  React.useEffect(() => {
    readCurrentWindowTabs().then((current) => {
      setTabs(current)
      setSelectedTabIds(new Set(current.map((tab) => tab.id)))
    })
  }, [])

  const selectedTabs = (tabs ?? []).filter((tab) => selectedTabIds.has(tab.id))

  function toggleTabSelection(tabId: string) {
    setSelectedTabIds((current) => {
      const next = new Set(current)
      if (next.has(tabId)) next.delete(tabId)
      else next.add(tabId)
      return next
    })
  }

  function selectAllTabs() {
    setSelectedTabIds(new Set((tabs ?? []).map((tab) => tab.id)))
  }

  function deselectAllTabs() {
    setSelectedTabIds(new Set())
  }

  return (
    <div className={cn(CARD, "p-3", TEXT)}>
      {tabs === null ? (
        <p className={cn("py-3 text-center text-xs", MUTED)}>Loading tabs...</p>
      ) : tabs.length === 0 ? (
        <p className={cn("py-3 text-center text-xs", MUTED)}>
          This window has no tabs StashWell can share.
        </p>
      ) : (
        <>
          <TabSelectionHeader
            label="Open tabs"
            selectedCount={selectedTabs.length}
            totalCount={tabs.length}
            onSelectAll={selectAllTabs}
            onDeselectAll={deselectAllTabs}
            className="pb-1.5"
          />

          {/* Not a multiple of the ~22px row height, so a long list visibly
              cuts a row in half - the hint that it scrolls. */}
          <div className="max-h-[190px] space-y-1.5 overflow-y-auto border-t border-[#e2e8f0] pt-2">
            {tabs.map((tab) => (
              <label key={tab.id} title={tab.url} className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedTabIds.has(tab.id)}
                  onChange={() => toggleTabSelection(tab.id)}
                  className={shareCheckboxClass("share")}
                />
                <Favicon url={tab.favIconUrl} />
                <span className="min-w-0 flex-1 truncate text-xs font-medium">
                  {tab.title || tab.url}
                </span>
              </label>
            ))}
          </div>

          <ShareTabsButton tabs={selectedTabs} tone="share" className="mt-2" />
        </>
      )}
    </div>
  )
}
