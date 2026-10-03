/**
 * The popup's two color tones: blue for saving (the Save Session tile and
 * everything inside a saved bundle), green for Quick Share (its tile and
 * panel). Kept in one place so a tile and the controls it leads to always
 * match. Full class strings, not built from parts, so Tailwind can see them.
 */
export const TONES = {
  save: {
    icon: "bg-[#1A73E8]/10 text-[#1A73E8]",
    button: "bg-[#1A73E8] hover:bg-[#1765CC]",
    active: "border-[#1A73E8]/40 ring-2 ring-[#1A73E8]/15",
    checkbox: "accent-[#1A73E8]",
  },
  share: {
    icon: "bg-[#34A853]/10 text-[#34A853]",
    button: "bg-[#34A853] hover:bg-[#2D9249]",
    active: "border-[#34A853]/40 ring-2 ring-[#34A853]/15",
    checkbox: "accent-[#34A853]",
  },
}

export type Tone = keyof typeof TONES
