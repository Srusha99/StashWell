export { cn } from "cn"

/**
 * Origin-only version of a URL, e.g. "https://notebook.google.com/watch?v=abc123"
 * -> "https://notebook.google.com/". For plain-text sharing (WhatsApp, SMS, and
 * other targets that can't carry a hidden href) so the visible text stays
 * short instead of a long path/query string, while remaining a valid,
 * auto-linkable URL on its own.
 */
export function shortUrl(url: string): string {
  try {
    return `${new URL(url).origin}/`
  } catch {
    return url
  }
}

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
