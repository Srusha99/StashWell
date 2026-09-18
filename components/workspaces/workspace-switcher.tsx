"use client"

import * as React from "react"
import { ChevronDown, Plus, Settings2 } from "lucide-react"

import { cn, deferred } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useWorkspaces } from "@/components/workspaces/workspace-provider"
import { ManageWorkspacesDialog } from "@/components/workspaces/manage-workspaces-dialog"

/**
 * Emoji need their own fixed box. They're text, so the menu item's `[&_svg]`
 * sizing never applies, but glyph widths vary wildly between flags, ZWJ
 * sequences and plain pictographs, and names wouldn't line up without one.
 * `size-4` sets the box; the font-size has to go on the glyph itself or tall
 * emoji get clipped.
 */
function Emoji({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("flex size-4 shrink-0 items-center justify-center leading-none", className)}
    >
      {children}
    </span>
  )
}

export function WorkspaceSwitcher({ className }: { className?: string }) {
  const { workspaces, activeWorkspace, activeId, isReady, switchTo } = useWorkspaces()
  const [manageOpen, setManageOpen] = React.useState(false)
  const [createOnOpen, setCreateOnOpen] = React.useState(false)

  function openManage(startCreating: boolean) {
    setCreateOnOpen(startCreating)
    setManageOpen(true)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="secondary"
              size="sm"
              aria-label="Switch workspace"
              title="Switch workspace"
              className={cn(
                // Mirrors the dashboard's fixed settings button, and pairs the
                // light-only --card-border / --shadow-soft tokens with dark
                // overrides - in dark mode those vars don't exist and
                // border-color would fall back to currentColor (a white line).
                "gap-2 rounded-full border border-[var(--card-border)] bg-white px-3 text-[#1c1c1e] shadow-[var(--shadow-soft)] backdrop-blur-md hover:bg-[#fafafa] dark:border-white/15 dark:bg-black/40 dark:text-white dark:shadow-none dark:hover:bg-black/60",
                className
              )}
            />
          }
        >
          <Emoji className="text-[13px]">{isReady ? activeWorkspace.emoji : ""}</Emoji>
          {/* Held back until the client has read localStorage: the prerendered
              markup can't know which workspace is active. */}
          <span className="max-w-32 truncate">{isReady ? activeWorkspace.name : "Workspace"}</span>
          <ChevronDown className="size-3.5 opacity-60" />
        </DropdownMenuTrigger>

        {/* w-auto min-w-56 overrides the default w-(--anchor-width): anchored to
            this narrow pill, every workspace name would otherwise truncate. */}
        <DropdownMenuContent align="start" sideOffset={6} className="w-auto min-w-56">
          {/* The label lives INSIDE the radio group: it renders Base UI's
              Menu.GroupLabel, which throws "MenuGroupContext is missing" if it
              has no Menu.Group / Menu.RadioGroup ancestor - and that throw takes
              the whole app down the moment the popup opens. Being inside also
              makes it the group's accessible name. */}
          <DropdownMenuRadioGroup
            value={activeId}
            onValueChange={(value) => switchTo(value as string)}
          >
            <DropdownMenuLabel className="uppercase tracking-wide">Workspaces</DropdownMenuLabel>
            {workspaces.map((workspace) => (
              <DropdownMenuRadioItem key={workspace.id} value={workspace.id} className="gap-2">
                <Emoji className="text-[13px]">{workspace.emoji}</Emoji>
                <span className="truncate">{workspace.name}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>

          {/* Outside the radio group: a plain item nested inside one inherits
              its semantics and gets announced as an unchecked radio. */}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="gap-2" onClick={deferred(() => openManage(true))}>
            <Plus /> New workspace
          </DropdownMenuItem>
          {/* deferred() because opening a Dialog in the same tick as the menu
              closes races the menu's focus return against the backdrop's
              aria-hidden - see lib/utils.ts. */}
          <DropdownMenuItem className="gap-2" onClick={deferred(() => openManage(false))}>
            <Settings2 /> Manage workspaces
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ManageWorkspacesDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        startCreating={createOnOpen}
      />
    </>
  )
}
