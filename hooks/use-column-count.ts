"use client"

import * as React from "react"

// Matches the sm/lg/xl breakpoints the dashboard's Pinterest-style columns
// use, so the JS-driven layout always agrees with Tailwind's breakpoints.
const BREAKPOINTS: { query: string; count: number }[] = [
  { query: "(min-width: 1280px)", count: 4 },
  { query: "(min-width: 1024px)", count: 3 },
  { query: "(min-width: 640px)", count: 2 },
]

function computeColumnCount(): number {
  if (typeof window === "undefined") return 1
  for (const bp of BREAKPOINTS) {
    if (window.matchMedia(bp.query).matches) return bp.count
  }
  return 1
}

export function useColumnCount(): number {
  const [count, setCount] = React.useState(computeColumnCount)

  React.useEffect(() => {
    const mediaQueries = BREAKPOINTS.map((bp) => window.matchMedia(bp.query))
    const handleChange = () => setCount(computeColumnCount())

    mediaQueries.forEach((mql) => mql.addEventListener("change", handleChange))
    handleChange()

    return () => mediaQueries.forEach((mql) => mql.removeEventListener("change", handleChange))
  }, [])

  return count
}
