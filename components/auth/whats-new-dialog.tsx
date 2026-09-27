"use client"

import { CalendarSync, LayoutDashboard, X } from "lucide-react"

import { KanbanIcon } from "@/components/icons/kanban-icon"
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

const WHATS_NEW_ITEMS = [
  {
    title: "Task Flow",
    description:
      "Turn any folder into a kanban board and drag bookmarks through custom stages.",
    icon: KanbanIcon,
    iconClassName: "bg-gradient-to-br from-blue-700 to-blue-500",
  },
  {
    title: "Google Calendar Sync",
    description:
      "See your upcoming events right on the dashboard, synced straight from Google Calendar.",
    icon: CalendarSync,
    iconClassName: "bg-gradient-to-br from-orange-700 to-orange-500",
  },
  {
    title: "Dashboard Cleanup",
    description: "A tidier layout with clearer spacing and fewer distractions.",
    icon: LayoutDashboard,
    iconClassName: "bg-gradient-to-br from-violet-700 to-purple-500",
  },
]

export function WhatsNewDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex w-full max-w-[21rem] flex-col gap-0 overflow-hidden rounded-2xl border border-white/10 bg-[#141414] p-0 text-white ring-0 shadow-[0_30px_60px_-12px_rgba(0,0,0,0.8)] sm:max-w-[21rem]"
      >
        <div className="pointer-events-none absolute -top-20 left-1/2 size-40 -translate-x-1/2 rounded-full bg-emerald-500/40 blur-3xl" />

        <div className="relative flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="flex items-center gap-1.5 bg-gradient-to-br from-white to-zinc-400 bg-clip-text text-base font-bold tracking-tight text-transparent">
            What&apos;s New <span className="text-sm">✨</span>
          </h2>
          <DialogClose
            render={
              <button
                type="button"
                aria-label="Close"
                className="flex size-6.5 items-center justify-center rounded-full bg-white/5 text-zinc-400 transition duration-200 hover:rotate-90 hover:bg-white/10 hover:text-white"
              />
            }
          >
            <X className="size-3.5" />
          </DialogClose>
        </div>

        <div className="relative flex flex-col gap-0.5 px-2.5 pb-5">
          {WHATS_NEW_ITEMS.map((item, index) => (
            <div
              key={item.title}
              className="flex items-start gap-3 rounded-xl p-2.5 transition duration-300 hover:translate-x-1 hover:bg-white/3"
            >
              <div
                className={cn(
                  "animate-whats-new-float relative flex size-9 shrink-0 items-center justify-center rounded-xl shadow-lg after:absolute after:inset-x-px after:top-px after:h-1/2 after:rounded-t-xl after:bg-gradient-to-b after:from-white/20 after:to-transparent",
                  item.iconClassName
                )}
                style={{ animationDelay: `${index * 0.5}s` }}
              >
                <item.icon className="relative z-10 size-4 text-white" />
              </div>
              <div>
                <h3 className="mb-0.5 text-[13px] font-semibold text-zinc-100">
                  {item.title}
                </h3>
                <p className="text-xs leading-relaxed text-zinc-400">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="relative px-5 pb-5">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-700 py-2.5 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(46,160,67,0.3)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(46,160,67,0.4)]"
          >
            <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-500 group-hover:translate-x-full" />
            <span className="relative">Got it!</span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
