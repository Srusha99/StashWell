"use client"

import * as React from "react"
import { Search } from "lucide-react"
import { useTheme } from "next-themes"
import TextType from "@/components/ui/TextType"
import { BorderBeam } from "@/components/ui/border-beam-search"
import { useNow } from "@/hooks/use-now"

function getGreeting(hour: number, name: string) {
  const who = name.trim() || "there"
  if (hour >= 6 && hour < 12) return `Good Morning ${who}`
  if (hour >= 12 && hour < 17) return `Good Afternoon ${who}`
  if (hour >= 17 && hour < 21) return `Good Evening ${who}`
  return `Good Night ${who}`
}

export function DashboardHeader({
  greetingName,
  greetingEnabled,
  searchBarEnabled,
}: {
  greetingName: string
  greetingEnabled: boolean
  searchBarEnabled: boolean
}) {
  const now = useNow(1000)
  const [query, setQuery] = React.useState("")
  const { resolvedTheme } = useTheme()
  const isLight = resolvedTheme === "light"

  const time = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })
  const date = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
  const greeting = getGreeting(now.getHours(), greetingName)

  function handleSearchSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return
    window.location.href = `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`
  }

  return (
    <div className="mb-8 flex flex-col items-center gap-2 pt-6 text-center text-[#1c1c1e] dark:text-white">
      <span className="text-6xl font-bold tracking-tight tabular-nums">{time}</span>
      <div className="text-lg text-[#8e8e93] dark:text-white/60">{date}</div>
      {greetingEnabled && (
        <TextType
          as="div"
          text={greeting}
          className="text-xl text-[#1c1c1e]/80 dark:text-white/80"
          typingSpeed={120}
          initialDelay={200}
          loop={false}
          showCursor
          hideCursorWhileTyping
          cursorCharacter="|"
        />
      )}
      {searchBarEnabled && (
        <form onSubmit={handleSearchSubmit} className="mt-4 w-full max-w-[366px]">
          <BorderBeam size="line" colorVariant="colorful" theme={isLight ? "light" : "dark"} duration={3.1} borderRadius={20}>
            <div className="relative h-[42px] w-full overflow-hidden rounded-[64px]">
              <div
                className={
                  isLight
                    ? "absolute inset-0 flex items-center gap-2.5 rounded-[20px] bg-white px-[13px] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08),inset_0_0_50px_0_rgba(0,0,0,0.02)]"
                    : "absolute inset-0 flex items-center gap-2.5 rounded-[20px] bg-white/[0.04] px-[13px] backdrop-blur-md shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]"
                }
              >
                <Search className={isLight ? "h-5 w-5 shrink-0 text-[#8e8e93]" : "h-5 w-5 shrink-0 text-white/40"} strokeWidth={2} />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="What's on your mind today?"
                  className={
                    isLight
                      ? "w-full bg-transparent text-[15px] leading-[18px] text-[#1c1c1e] outline-none placeholder:text-[#8e8e93]"
                      : "w-full bg-transparent text-[15px] leading-[18px] text-white outline-none placeholder:text-white/40"
                  }
                />
              </div>
            </div>
          </BorderBeam>
        </form>
      )}
    </div>
  )
}
