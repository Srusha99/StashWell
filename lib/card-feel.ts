/**
 * Maps the Appearance panel's 0-100 sliders onto the CSS custom properties the
 * dashboard cards are built from.
 *
 * Driving cards through CSS variables rather than inline styles means one write
 * to <html> restyles every card at once, with no re-render and no prop threading
 * down to each one. The light/dark split lives in globals.css, which reads these
 * same variables - dark cards need far less white to read as a surface, so only
 * the alpha is shared, not the final colour.
 */

export interface CardFeel {
  /** Card background opacity. */
  cardOpacity: number
  /** Backdrop blur strength - the main lever on how much wallpaper reads through. */
  blurIntensity: number
  cardRadius: number
  gridSpacing: number
  /** Internal padding: compact through roomy. */
  density: number
  /** Shadow / glow strength around each card. */
  glow: number
}

export const DEFAULT_CARD_FEEL: CardFeel = {
  cardOpacity: 55,
  blurIntensity: 60,
  cardRadius: 55,
  gridSpacing: 45,
  density: 45,
  glow: 35,
}

export const CARD_FEEL_KEYS = Object.keys(DEFAULT_CARD_FEEL) as (keyof CardFeel)[]

export const CARD_FEEL_LABELS: Record<keyof CardFeel, string> = {
  cardRadius: "Card radius",
  gridSpacing: "Grid spacing",
  blurIntensity: "Blur intensity",
  cardOpacity: "Card opacity",
  density: "Density",
  glow: "Glow",
}

/** Linear interpolation from a 0-100 slider onto a real range. */
function scale(percent: number, min: number, max: number): number {
  const clamped = Math.min(100, Math.max(0, percent))
  return min + ((max - min) * clamped) / 100
}

function round(value: number, places = 3): number {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

/** The CSS custom properties for a given slider set. */
export function cardFeelVars(feel: CardFeel): Record<string, string> {
  return {
    // Kept as a bare number so globals.css can scale it per theme.
    "--card-alpha": `${round(scale(feel.cardOpacity, 0, 1))}`,
    "--card-blur": `${round(scale(feel.blurIntensity, 0, 40), 1)}px`,
    "--card-radius": `${round(scale(feel.cardRadius, 4, 28), 1)}px`,
    "--card-pad": `${round(scale(feel.density, 8, 22), 1)}px`,
    "--grid-gap": `${round(scale(feel.gridSpacing, 6, 28), 1)}px`,
    "--card-glow-alpha": `${round(scale(feel.glow, 0, 0.14))}`,
  }
}

/**
 * Writes the variables onto <html>, so they reach the dashboard and every
 * portalled dialog alike. Safe to call before hydration finishes.
 */
export function applyCardFeel(feel: CardFeel): void {
  if (typeof document === "undefined") return
  const style = document.documentElement.style
  for (const [name, value] of Object.entries(cardFeelVars(feel))) {
    style.setProperty(name, value)
  }
}

/** Pulls just the feel values out of a wider settings object, filling gaps. */
export function readCardFeel(source: Partial<CardFeel> | undefined): CardFeel {
  const feel = { ...DEFAULT_CARD_FEEL }
  if (!source) return feel
  for (const key of CARD_FEEL_KEYS) {
    const value = source[key]
    if (typeof value === "number" && Number.isFinite(value)) {
      feel[key] = Math.min(100, Math.max(0, value))
    }
  }
  return feel
}
