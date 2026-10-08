/**
 * The popup's look, kept in one place so every piece of it matches.
 *
 * Two color tones: blue for saving (the Save Session card and everything
 * about a saved bundle), green for Quick Share (its card and panel). Full
 * class strings, not built from parts, so Tailwind can see them.
 */
export const TONES = {
  save: {
    icon: "bg-[#eff6ff] text-[#3b82f6]",
    button:
      "bg-gradient-to-br from-[#3b82f6] to-[#2563eb] shadow-[0_4px_12px_rgba(59,130,246,0.25)] hover:-translate-y-px hover:shadow-[0_6px_16px_rgba(59,130,246,0.35)]",
    active: "border-[#3b82f6]/50 ring-2 ring-[#3b82f6]/15",
    checkbox: "accent-[#3b82f6]",
  },
  share: {
    icon: "bg-[#ecfdf5] text-[#10b981]",
    button:
      "bg-gradient-to-br from-[#10b981] to-[#059669] shadow-[0_4px_12px_rgba(16,185,129,0.25)] hover:-translate-y-px hover:shadow-[0_6px_16px_rgba(16,185,129,0.35)]",
    active: "border-[#10b981]/50 ring-2 ring-[#10b981]/15",
    checkbox: "accent-[#10b981]",
  },
}

export type Tone = keyof typeof TONES

/** The popup's background. */
export const POPUP_BACKGROUND = "#f4f6fb"

/** A white card - the action cards and expanded panels. */
export const CARD = "rounded-[18px] border border-[#e2e8f0] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]"

/** A white pill - a saved bundle's row, lifting slightly on hover. */
export const PILL =
  "rounded-full border border-[#e2e8f0] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition hover:-translate-y-px hover:border-[#cbd5e1] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]"

/** A saved bundle's row in the main list - a softer, rounded-rectangle card. */
export const ROW =
  "rounded-[20px] border border-[#eef1f6] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.06)] transition hover:-translate-y-px hover:shadow-[0_6px_16px_rgba(15,23,42,0.08)]"

/** The same pill, tinted for a bundle the free plan's limit is counting. */
export const PILL_HIGHLIGHT = "rounded-full border border-[#fed7aa] bg-[#fff7ed] transition hover:shadow-[0_1px_3px_rgba(0,0,0,0.04)]"

/** Main text. */
export const TEXT = "text-[#0f172a]"

/** Secondary text. */
export const MUTED = "text-[#64748b]"
