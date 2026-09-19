/**
 * Time-of-day greeting, shared by the dashboard header and the assistant panel's
 * empty state.
 *
 * Lives in lib/ rather than in dashboard-header.tsx so importing it doesn't drag
 * BorderBeam, next-themes and useNow into the assistant panel's chunk.
 */
export function getGreeting(hour: number, name: string): string {
  const who = name.trim() || "there"
  if (hour >= 6 && hour < 12) return `Good Morning ${who}`
  if (hour >= 12 && hour < 17) return `Good Afternoon ${who}`
  if (hour >= 17 && hour < 21) return `Good Evening ${who}`
  return `Good Night ${who}`
}

/** Short form for the assistant's empty state: "Morning, Arihant!" */
export function getShortGreeting(hour: number, name: string): string {
  const who = name.trim()
  const part =
    hour >= 6 && hour < 12
      ? "Morning"
      : hour >= 12 && hour < 17
        ? "Afternoon"
        : hour >= 17 && hour < 21
          ? "Evening"
          : "Hello"
  return who ? `${part}, ${who}!` : `${part}!`
}
