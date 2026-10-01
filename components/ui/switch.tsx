"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import { cn } from "cn"

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      // A real <button> rather than Base UI's default <span role="switch">,
      // which the browser treats as text: I-beam cursor, selectable, and
      // somewhere a text caret can land.
      nativeButton
      render={<button type="button" />}
      className={cn(
        "peer inline-flex h-5 w-8 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-input p-0.5 shadow-xs transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[checked]:bg-primary",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-4 rounded-full bg-background shadow-sm ring-0 transition-transform data-[checked]:translate-x-3 data-[unchecked]:translate-x-0"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
