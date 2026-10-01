"use client"

import { Slider as SliderPrimitive } from "@base-ui/react/slider"
import { cn } from "cn"

/**
 * `label` names the thumb's underlying range input. A plain <label htmlFor> can't
 * be used here: Root renders a div, which isn't a labelable element, so the
 * association would silently do nothing.
 *
 * `valueLabel` floats the current value (e.g. "115%") in a bubble above the
 * thumb, rather than leaving the caller to print it beside the label. The
 * control gets top margin so the bubble has somewhere to sit.
 */
function Slider({
  className,
  label,
  valueLabel,
  ...props
}: SliderPrimitive.Root.Props<number> & {
  className?: string
  label?: string
  valueLabel?: (value: number) => string
}) {
  return (
    <SliderPrimitive.Root data-slot="slider" {...props}>
      <SliderPrimitive.Control
        className={cn(
          "flex h-4 w-full touch-none items-center select-none",
          valueLabel && "mt-8",
          className
        )}
      >
        <SliderPrimitive.Track className="h-1 w-full rounded-full bg-black/10 select-none dark:bg-white/15">
          <SliderPrimitive.Indicator className="h-1 rounded-full bg-primary select-none" />
          <SliderPrimitive.Thumb
            getAriaLabel={label ? () => label : undefined}
            className="size-3.5 rounded-full bg-primary shadow-sm outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {valueLabel && (
              <SliderPrimitive.Value className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-md border border-border bg-popover px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-popover-foreground tabular-nums shadow-sm">
                {(_formatted, values) => valueLabel(values[0])}
              </SliderPrimitive.Value>
            )}
          </SliderPrimitive.Thumb>
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
