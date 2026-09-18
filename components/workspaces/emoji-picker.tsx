"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/**
 * A starting point, not a limit - the free-text field below the grid accepts
 * any emoji (or any character), so nobody is stuck with these.
 */
const PRESETS = [
  "🏠", "💼", "📚", "🌿", "🎨", "🔬", "💻", "🎮",
  "✈️", "🍳", "🎵", "📷", "💰", "🏋️", "🧠", "🌙",
  "⭐", "🔥", "🌊", "🌸", "🐙", "🦊", "🐧", "🦉",
  "📌", "🗂️", "🧩", "⚙️", "🎯", "🚀", "🧪", "📈",
  "☕", "🍕", "🌍", "🕹️", "🎬", "📝", "🔖", "🧭",
]

export function EmojiPicker({
  value,
  onChange,
  label = "Emoji",
}: {
  value: string
  onChange: (emoji: string) => void
  label?: string
}) {
  const [open, setOpen] = React.useState(false)

  function pick(emoji: string) {
    onChange(emoji)
    setOpen(false)
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={`${label}: ${value}`}
            title={label}
          />
        }
      >
        <span aria-hidden className="text-base leading-none">
          {value}
        </span>
      </DropdownMenuTrigger>

      {/* w-auto overrides DropdownMenuContent's default w-(--anchor-width),
          which would otherwise squeeze the grid to the trigger's 32px. */}
      <DropdownMenuContent align="start" className="w-auto p-2">
        <div className="grid grid-cols-8 gap-0.5">
          {PRESETS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => pick(emoji)}
              aria-label={emoji}
              className="flex size-7 items-center justify-center rounded-md text-base leading-none transition-colors hover:bg-accent"
            >
              <span aria-hidden>{emoji}</span>
            </button>
          ))}
        </div>

        <div className="mt-2 border-t pt-2">
          <label
            htmlFor="workspace-emoji-custom"
            className="text-xs font-medium text-muted-foreground"
          >
            Or paste any emoji
          </label>
          <Input
            id="workspace-emoji-custom"
            value={value}
            onChange={(event) => {
              // Take the first grapheme so a paste of several emoji doesn't
              // wreck the pill's layout. Intl.Segmenter keeps flags and ZWJ
              // sequences (family, skin tones) intact where [...str][0] would
              // slice them into pieces.
              const next = firstGrapheme(event.target.value)
              onChange(next)
            }}
            className="mt-1 h-7 text-center text-base"
            maxLength={16}
          />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function firstGrapheme(value: string): string {
  if (!value) return ""
  try {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" })
    const first = segmenter.segment(value)[Symbol.iterator]().next()
    return first.done ? "" : first.value.segment
  } catch {
    return [...value][0] ?? ""
  }
}
