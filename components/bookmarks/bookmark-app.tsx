"use client"

import * as React from "react"

import MoltenMetal from "@/components/MoltenMetal"
import GlowCursor from "@/components/GlowCursor"
import { DashboardView } from "@/components/bookmarks/dashboard-view"
import { BookmarkManager } from "@/components/bookmarks/bookmark-manager"

export function BookmarkApp() {
  const [managerFolderId, setManagerFolderId] = React.useState<string | null>(null)

  return (
    <div className="relative h-screen w-screen text-foreground">
      <div className="fixed inset-0 -z-10">
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
          colorMode="molten"
          grain
          grainIntensity={0.05}
          mouseInteraction={false}
          mouseStrength={0.3}
          opacity={1}
        />
      </div>

      <GlowCursor color="#67E8F9" secondaryColor="#A78BFA">
        {managerFolderId !== null ? (
          <BookmarkManager
            initialFolderId={managerFolderId}
            onBack={() => setManagerFolderId(null)}
          />
        ) : (
          <DashboardView onOpenManager={setManagerFolderId} />
        )}
      </GlowCursor>
    </div>
  )
}
