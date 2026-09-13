"use client"

import * as React from "react"
import TextType from "@/components/ui/TextType"

const USER_NAME = "Srush"

function useNow(intervalMs: number) {
  const [now, setNow] = React.useState(() => new Date())

  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return now
}

function getGreeting(hour: number) {
  if (hour >= 6 && hour < 12) return `Good Morning ${USER_NAME}`
  if (hour >= 12 && hour < 17) return `Good Afternoon ${USER_NAME}`
  if (hour >= 17 && hour < 21) return `Good Evening ${USER_NAME}`
  return `Good Night ${USER_NAME}`
}

export function DashboardHeader() {
  const now = useNow(1000)

  const time = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })
  const date = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
  const greeting = getGreeting(now.getHours())

  return (
    <div className="mb-8 flex flex-col items-center gap-2 pt-6 text-center text-white">
      <span className="text-6xl font-bold tracking-tight tabular-nums">{time}</span>
      <div className="text-lg text-white/60">{date}</div>
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
    </div>
  )
}
