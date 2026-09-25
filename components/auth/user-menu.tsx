"use client"

import * as React from "react"
import { CreditCard, HelpCircle, LogOut, Settings, Zap } from "lucide-react"

import { useAuth } from "@/lib/auth-context"
import { useIsPro } from "@/hooks/use-is-pro"
import { supabase } from "@/lib/supabaseClient"
import { cn, deferred } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ThemeSwitcher } from "@/components/ui/theme-switcher"

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

function ProBadge() {
  return (
    <span className="ml-auto flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-400">
      <Zap className="size-2.5 fill-current" /> PRO
    </span>
  )
}

function Avatar({
  avatarUrl,
  initials,
  className,
}: {
  avatarUrl: string | null
  initials: string
  className?: string
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#5227ff] text-white",
        className
      )}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="size-full object-cover" />
      ) : (
        <span className="text-xs font-semibold">{initials}</span>
      )}
    </span>
  )
}

export function UserMenu({
  onOpenSettings,
  className,
}: {
  onOpenSettings: () => void
  className?: string
}) {
  const { user } = useAuth()
  const isPro = useIsPro()
  if (!user) return null

  const metadata = user.user_metadata as
    | {
        full_name?: string
        name?: string
        avatar_url?: string
        picture?: string
      }
    | undefined
  const rawName = metadata?.full_name || metadata?.name || null
  const email = user.email ?? ""
  const displayName = rawName || email || "Account"
  const avatarUrl = metadata?.avatar_url || metadata?.picture || null
  const initials = initialsOf(displayName)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label="Account menu"
            title={displayName}
            className={cn(
              "rounded-full border border-[var(--card-border)] shadow-[var(--shadow-soft)] backdrop-blur-md dark:border-white/15 dark:shadow-none",
              className
            )}
          />
        }
      >
        <Avatar avatarUrl={avatarUrl} initials={initials} className="size-9" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="w-64">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <Avatar avatarUrl={avatarUrl} initials={initials} className="size-9 text-sm" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-[#1c1c1e] dark:text-white">
              {displayName}
            </div>
            {rawName && email && (
              <div className="truncate text-xs text-[#8e8e93] dark:text-white/50">
                {email}
              </div>
            )}
          </div>
        </div>

        {isPro ? (
          <div className="flex items-center gap-2 px-1.5 py-1 text-sm text-[#1c1c1e] dark:text-white">
            <CreditCard className="size-4 text-[#8e8e93] dark:text-white/50" />
            <span className="flex-1">Subscription</span>
            <ProBadge />
          </div>
        ) : (
          // No checkout flow exists yet - shown as a real button, but inert
          // until there's somewhere for it to send the user.
          <button
            type="button"
            className="mx-auto mb-3 flex w-[calc(100%-2rem)] items-center justify-center gap-1.5 rounded-full bg-emerald-500 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
          >
            <Zap className="size-4 fill-current" /> Upgrade to Pro
          </button>
        )}

        <DropdownMenuItem onClick={deferred(onOpenSettings)}>
          <Settings /> Settings
        </DropdownMenuItem>
        {/* No help destination exists yet - shown but inert until there's
            somewhere for it to go. */}
        <DropdownMenuItem disabled>
          <HelpCircle /> Support
        </DropdownMenuItem>

        <div className="flex items-center justify-between gap-2 px-1.5 py-1 text-sm text-[#1c1c1e] dark:text-white">
          <span>Theme</span>
          <ThemeSwitcher />
        </div>

        <DropdownMenuItem onClick={() => void supabase.auth.signOut()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
