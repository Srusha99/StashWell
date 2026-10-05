/**
 * Change notifications for the dashboard settings kept in window.localStorage
 * (hidden folders, each card's list/grid view). chrome.storage has onChanged;
 * localStorage only fires "storage" in *other* tabs, so a write here would go
 * unnoticed by this tab's own hooks and by dashboard sync
 * (lib/dashboard-sync-engine.ts) without this.
 */

const EVENT = "stashwell:local-setting"

/** Call after writing `key`. Dispatched a tick later, so a write made inside a
 * React state updater doesn't trigger another component's update mid-render. */
export function notifyLocalSettingChanged(key: string): void {
  if (typeof window === "undefined") return
  queueMicrotask(() => window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: key })))
}

/** Calls `onChange` with the key of every setting written - in this tab or another. */
export function subscribeLocalSettings(onChange: (key: string) => void): () => void {
  if (typeof window === "undefined") return () => {}

  function onLocal(event: Event) {
    onChange((event as CustomEvent<string>).detail)
  }
  function onStorage(event: StorageEvent) {
    if (event.key) onChange(event.key)
  }

  window.addEventListener(EVENT, onLocal)
  window.addEventListener("storage", onStorage)
  return () => {
    window.removeEventListener(EVENT, onLocal)
    window.removeEventListener("storage", onStorage)
  }
}
