/**
 * The one card shell every dashboard card uses.
 *
 * Shared as a constant rather than copied, because these sit side by side in the
 * same columns and any drift between them is immediately visible.
 *
 * Translucent + backdrop-blur so the wallpaper reads through; the sliders in
 * Appearance > Fine-tune the feel drive the variables (see lib/card-feel.ts).
 *
 * The --card-border and --shadow-soft tokens exist only under :root:not(.dark),
 * so in dark mode border-color would fall back to currentColor (a visible white
 * outline) without the dark: override that goes with them.
 *
 * Plain module, no "use client": imported by both client components and safe to
 * pull into anything.
 */
export const CARD_SHELL =
  "group relative flex min-w-0 flex-col rounded-[var(--card-radius)] border border-[var(--card-border)] bg-[var(--card-bg)] p-[var(--card-pad)] shadow-[var(--card-glow)] backdrop-blur-[var(--card-blur)] transition-all duration-150 ease-out dark:border-white/[0.08]"

/** Shared header row: small uppercase label. */
export const CARD_TITLE =
  "min-w-0 flex-1 truncate text-[10.5px] font-semibold tracking-[0.06em] text-[#1c1c1e]/80 uppercase dark:text-white/80"
