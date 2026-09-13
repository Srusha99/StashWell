export { cn } from "cn"

/**
 * Wraps a callback so it runs on the next tick instead of synchronously.
 * Use for actions that open a Dialog from inside a closing Menu/DropdownMenu
 * item — opening it in the same tick races the menu's own focus-return
 * against the dialog's `aria-hidden`-ing of the background, which trips
 * "Blocked aria-hidden on an element because its descendant retained focus."
 */
export function deferred<T extends unknown[]>(fn: (...args: T) => void) {
  return (...args: T) => {
    setTimeout(() => fn(...args), 0)
  }
}
