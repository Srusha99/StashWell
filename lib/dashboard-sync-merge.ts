/**
 * Pure merge logic for dashboard sync (lib/dashboard-sync-engine.ts) - no
 * storage, no network.
 *
 * Every merge is three-way: this device's copy, the cloud's copy, and the
 * "base" - what the two last agreed on, which this device remembers as a hash
 * per item. The base is what tells a deletion from an addition: a task missing
 * from the cloud but in the base was deleted on another device, while one
 * missing from the cloud and not in the base was just added here. Without it,
 * every merge would either resurrect deleted tasks or drop new ones.
 */

/**
 * JSON with object keys sorted. Postgres jsonb doesn't keep key order, so a
 * value round-tripped through the cloud must still hash the same as the copy
 * that was sent.
 */
export function stableStringify(value: unknown): string {
  if (value === undefined) return "null"
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(",")}}`
}

/** cyrb53 - fast, well-distributed, 53 bits. Only ever compared, never trusted
 * for security. */
function cyrb53(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

export function hashValue(value: unknown): string {
  return cyrb53(stableStringify(value))
}

/** A list as last synced: each item's id and hash, in order. */
export type Snapshot = [id: string, hash: string][]

export function snapshotOf<T>(items: T[], getId: (item: T) => string): Snapshot {
  return items.map((item) => [getId(item), hashValue(item)])
}

export function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  return a.length === b.length && a.every(([id, hash], i) => b[i][0] === id && b[i][1] === hash)
}

/** True when the ids `a` and `b` share appear in the same relative order. */
function sameRelativeOrder(a: string[], b: string[]): boolean {
  const inB = new Set(b)
  const inA = new Set(a)
  const sharedA = a.filter((id) => inB.has(id))
  const sharedB = b.filter((id) => inA.has(id))
  return sharedA.every((id, i) => sharedB[i] === id)
}

/**
 * Lays out `keep` following `skeleton`'s order, then slots in whatever only
 * `other` has right after the item it followed there - so a task added on one
 * device lands next to its neighbours, not at the end.
 */
function orderedMerge<T>(
  skeleton: string[],
  other: string[],
  keep: Map<string, T>
): T[] {
  const order = skeleton.filter((id) => keep.has(id))
  const placed = new Set(order)
  let anchor: string | null = null
  for (const id of other) {
    if (!keep.has(id)) continue
    if (!placed.has(id)) {
      order.splice(anchor === null ? 0 : order.indexOf(anchor) + 1, 0, id)
      placed.add(id)
    }
    anchor = id
  }
  return order.map((id) => keep.get(id) as T)
}

/**
 * Merges an id-keyed list (tasks, sessions).
 *
 *  - Nothing in the cloud yet: this device's copy goes up as it is.
 *  - Never synced on this device (`base` null): the cloud's copy, plus
 *    whatever `missing` says only this device has - nothing local is lost when
 *    signing in on a device that was used signed out.
 *  - Otherwise, per item: a change on one side wins over no change on the
 *    other, a deletion on one side wins over no change on the other, and when
 *    both sides changed the same item this device's edit wins - it's the one
 *    the user is looking at.
 */
export function mergeCollections<T>({
  base,
  local,
  remote,
  getId,
  missing,
}: {
  base: Snapshot | null
  local: T[]
  remote: T[] | null
  getId: (item: T) => string
  missing: (current: T[], incoming: T[]) => T[]
}): T[] {
  if (remote === null) return local
  if (base === null) return [...remote, ...missing(remote, local)]

  const localSnapshot = snapshotOf(local, getId)
  const remoteSnapshot = snapshotOf(remote, getId)
  if (sameSnapshot(localSnapshot, base)) return remote
  if (sameSnapshot(remoteSnapshot, base)) return local

  const baseHashes = new Map(base)
  const localHashes = new Map(localSnapshot)
  const remoteHashes = new Map(remoteSnapshot)
  const localById = new Map(local.map((item) => [getId(item), item]))
  const remoteById = new Map(remote.map((item) => [getId(item), item]))

  const keep = new Map<string, T>()
  for (const id of new Set([...localById.keys(), ...remoteById.keys()])) {
    const localItem = localById.get(id)
    const remoteItem = remoteById.get(id)
    const baseHash = baseHashes.get(id)

    if (localItem !== undefined && remoteItem !== undefined) {
      const changedHere = localHashes.get(id) !== baseHash
      const changedThere = remoteHashes.get(id) !== baseHash
      keep.set(id, changedThere && !changedHere ? remoteItem : localItem)
    } else if (localItem !== undefined) {
      // Gone from the cloud: deleted on another device - unless it's new here,
      // or was edited here since, in which case the edit is kept.
      if (baseHash === undefined || localHashes.get(id) !== baseHash) keep.set(id, localItem)
    } else if (remoteItem !== undefined) {
      if (baseHash === undefined || remoteHashes.get(id) !== baseHash) keep.set(id, remoteItem)
    }
  }

  return mergeOrder(base.map(([id]) => id), local.map(getId), remote.map(getId), keep)
}

/**
 * Orders the merged items in `keep`: whichever side was reordered since the
 * last sync (`baseIds`) sets the order, and items only the other side has are
 * slotted in next to their neighbours there.
 */
export function mergeOrder<T>(
  baseIds: string[],
  localIds: string[],
  remoteIds: string[],
  keep: Map<string, T>
): T[] {
  return sameRelativeOrder(localIds, baseIds)
    ? orderedMerge(remoteIds, localIds, keep)
    : orderedMerge(localIds, remoteIds, keep)
}

/**
 * Merges per-workspace dashboard settings - each workspace's arrangement,
 * hidden cards and grid cards, keyed the same on every device (see
 * lib/dashboard-sync-layouts.ts). Each is one unit: two devices' arrangements
 * can't be meaningfully combined card by card.
 *
 * Unlike tasks, a unit both sides changed takes the cloud's copy: most
 * "changes" to a layout aren't the user's - the dashboard appends a new
 * folder's card on its own (hooks/use-card-columns.ts) - and letting each
 * device's auto-placement win would bounce cards between devices. Units are
 * never deleted from the cloud: one this device doesn't have just stays there
 * for the devices that do.
 */
export function mergeSettings<T>(
  base: Record<string, string> | null,
  local: Record<string, T>,
  remote: Record<string, T> | null
): Record<string, T> {
  const merged: Record<string, T> = { ...(remote ?? {}) }
  for (const [key, layout] of Object.entries(local)) {
    const remoteLayout = remote?.[key]
    if (remoteLayout === undefined) {
      merged[key] = layout
      continue
    }
    const remoteUnchanged = base !== null && base[key] === hashValue(remoteLayout)
    if (remoteUnchanged) merged[key] = layout
  }
  return merged
}

export function hashUnits<T>(units: Record<string, T>): Record<string, string> {
  return Object.fromEntries(Object.entries(units).map(([key, unit]) => [key, hashValue(unit)]))
}
