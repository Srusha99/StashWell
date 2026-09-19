"use client"

import { Slider as SliderPrimitive } from "@base-ui/react/slider"
import { cn } from "cn"

/**
 * `label` names the thumb's underlying range input. A plain <label htmlFor> can't
 * be used here: Root renders a div, which isn't a labelable element, so the
 * association would silently do nothing.
 */
function Slider({
  className,
  label,
  ...props
}: SliderPrimitive.Root.Props<number> & { className?: string; label?: string }) {
  return (
    <SliderPrimitive.Root data-slot="slider" {...props}>
      <SliderPrimitive.Control
        className={cn("flex h-4 w-full touch-none items-center select-none", className)}
      >
        <SliderPrimitive.Track className="h-1 w-full rounded-full bg-black/10 select-none dark:bg-white/15">
          <SliderPrimitive.Indicator className="h-1 rounded-full bg-primary select-none" />
          <SliderPrimitive.Thumb
            getAriaLabel={label ? () => label : undefined}
            className="size-3.5 rounded-full bg-primary shadow-sm outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
