"use client"

import * as React from "react"
import TextType from "@/components/ui/TextType"

function useNow(intervalMs: number) {
  const [now, setNow] = React.useState(() => new Date())

  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return now
}

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
}: {
  greetingName: string
  greetingEnabled: boolean
}) {
  const now = useNow(1000)

  const time = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })
  const date = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
  const greeting = getGreeting(now.getHours(), greetingName)

  return (
    <div className="mb-8 flex flex-col items-center gap-2 pt-6 text-center text-white">
      <span className="text-6xl font-bold tracking-tight tabular-nums">{time}</span>
      <div className="text-lg text-white/60">{date}</div>
      {greetingEnabled && (
        <TextType
          as="div"
          text={greeting}
          className="text-xl text-white/80"
          typingSpeed={120}
          initialDelay={200}
          loop={false}
          showCursor
          hideCursorWhileTyping
          cursorCharacter="|"
        />
      )}
    </div>
  )
}
