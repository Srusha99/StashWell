/**
 * Per-workspace localStorage namespacing.
 *
 * Everything a workspace owns lives under `bm:ws:<workspaceId>:<name>` so that
 * deleting a workspace can sweep its data with a single prefix scan, and so
 * two workspaces can never read each other's state.
 *
 * Deliberately NOT namespaced, and why:
 *  - `bm:appearance`  - one look for the whole app, not per workspace.
 *  - `bm:view:<folderId>` - a folder belongs to exactly one workspace and
 *    folder ids are unique per profile, so the key is already partitioned.
 *    Namespacing it would only let one folder hold two conflicting view modes.
 *  - `bm:icon:<url>` - the same URL should share a user-uploaded icon across
 *    workspaces. These are 64x64 PNG data URLs (~4-8KB each) against a 5MB
 *    origin quota, so duplicating them per workspace is the one thing here
 *    that could realistically hit QuotaExceededError.
 */

const NAMESPACE = "bm:ws:"

export function workspaceKey(workspaceId: string, name: string): string {
  return `${NAMESPACE}${workspaceId}:${name}`
}

/**
 * Reads a JSON value scoped to a workspace. `validate` gets the parsed value
 * and returns the trusted value, or null to fall back - use it to filter
 * individually-corrupt array items rather than trusting the whole blob.
 */
export function readWorkspaceJson<T>(
  workspaceId: string,
  name: string,
  fallback: T,
  validate?: (parsed: unknown) => T | null
): T {
  try {
    const raw = window.localStorage.getItem(workspaceKey(workspaceId, name))
    if (!raw) return fallback
    const parsed: unknown = JSON.parse(raw)
    if (!validate) return parsed as T
    const validated = validate(parsed)
    return validated === null ? fallback : validated
  } catch {
    return fallback
  }
}

export function writeWorkspaceJson<T>(workspaceId: string, name: string, value: T): void {
  try {
    window.localStorage.setItem(workspaceKey(workspaceId, name), JSON.stringify(value))
  } catch {
    // ignore write failures (storage disabled, quota exceeded)
  }
}

/** Removes every key belonging to a workspace. Used when one is deleted. */
export function clearWorkspaceData(workspaceId: string): void {
  if (!workspaceId) return
  const prefix = `${NAMESPACE}${workspaceId}:`

  try {
    // Collect first: removeItem() reindexes localStorage, so removing inside
    // the index loop silently skips every other match.
    const keys: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (key?.startsWith(prefix)) keys.push(key)
    }
    for (const key of keys) window.localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

/**
 * Copies a legacy global key into a workspace's namespace, without removing the
 * original - the old key stays as a rollback path and gets swept in a later
 * release. No-op if the target already holds something.
 */
export function migrateGlobalKey(workspaceId: string, legacyKey: string, name: string): void {
  try {
    const target = workspaceKey(workspaceId, name)
    if (window.localStorage.getItem(target) !== null) return
    const legacy = window.localStorage.getItem(legacyKey)
    if (legacy === null) return
    window.localStorage.setItem(target, legacy)
  } catch {
    // ignore
  }
}
