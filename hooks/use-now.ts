"use client"

import * as React from "react"

/**
 * Re-renders on an interval so time-derived values (the clock, reminder
 * due-date buckets) don't go stale. This is a new-tab page, so tabs get left
 * open overnight and anything comparing against "now" needs a ticker.
 *
 * Pick the coarsest interval that works: 1000 for a ticking clock, 60_000 for
 * anything that only changes by the minute.
 */
export function useNow(intervalMs: number): Date {
  const [now, setNow] = React.useState(() => new Date())

  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return now
}
