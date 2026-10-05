/**
 * Uploaded wallpapers, stored only in this browser's IndexedDB - never
 * uploaded anywhere (they're also left out of settings sync, see
 * lib/settings-sync.ts). IndexedDB holds the files as Blobs, so a
 * multi-megabyte image or video loads straight into an object URL with no
 * encoding step.
 *
 * Every function rejects with a WallpaperStoreError carrying a message that
 * can be shown as-is. How many uploads a user may keep, and which formats, is
 * lib/wallpaper-gate.ts's call, not this file's.
 */

import { isVideoFile } from "@/lib/wallpaper-gate"

const DB_NAME = "bm-appearance"
const DB_VERSION = 2
const STORE_NAME = "backgrounds"

export type CustomBackgroundKind = "image" | "video"

export interface CustomBackgroundRecord {
  id: string
  blob: Blob
  kind: CustomBackgroundKind
  mimeType: string
  name: string
  createdAt: number
}

export class WallpaperStoreError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = "WallpaperStoreError"
  }
}

function describe(error: unknown, fallback: string): WallpaperStoreError {
  if (error instanceof WallpaperStoreError) return error
  if (error instanceof DOMException && error.name === "QuotaExceededError") {
    return new WallpaperStoreError("There isn't enough free space on this device for that file.", {
      cause: error,
    })
  }
  return new WallpaperStoreError(fallback, { cause: error })
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new WallpaperStoreError("This browser can't store wallpapers."))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      // Version 1 stored records in a different shape; only that upgrade (or a
      // brand-new database) lands here.
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME)
      }
      db.createObjectStore(STORE_NAME, { keyPath: "id" })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () =>
      reject(new WallpaperStoreError("Close other StashWell tabs and try again."))
  })
}

/**
 * Runs `work` in one transaction and resolves with its result once the
 * transaction has committed - so a write that fails at commit (e.g. out of
 * quota) rejects instead of looking saved.
 */
async function withStore<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T> | void,
  fallbackMessage: string
): Promise<T | undefined> {
  let db: IDBDatabase | null = null
  try {
    db = await openDb()
    const tx = db.transaction(STORE_NAME, mode)
    const request = work(tx.objectStore(STORE_NAME))
    return await new Promise<T | undefined>((resolve, reject) => {
      tx.oncomplete = () => resolve(request ? request.result : undefined)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error ?? new WallpaperStoreError(fallbackMessage))
    })
  } catch (error) {
    throw describe(error, fallbackMessage)
  } finally {
    db?.close()
  }
}

function kindOf(file: File): CustomBackgroundKind {
  return isVideoFile(file) ? "video" : "image"
}

export async function saveCustomBackground(file: File): Promise<CustomBackgroundRecord> {
  const record: CustomBackgroundRecord = {
    id: crypto.randomUUID(),
    blob: file,
    kind: kindOf(file),
    mimeType: file.type,
    name: file.name,
    createdAt: Date.now(),
  }
  await withStore("readwrite", (store) => store.put(record), "Couldn't save that wallpaper.")
  return record
}

/**
 * Swaps the file in an existing upload, keeping its id and place - so the
 * wallpaper setting pointing at it, and the daily rotation's order, carry on
 * as they were. Saves it as a new upload if `id` is gone.
 */
export async function replaceCustomBackground(id: string, file: File): Promise<CustomBackgroundRecord> {
  const existing = await withStore<CustomBackgroundRecord>(
    "readonly",
    (store) => store.get(id),
    "Couldn't read your current wallpaper."
  )
  if (!existing) return saveCustomBackground(file)

  const record: CustomBackgroundRecord = {
    ...existing,
    blob: file,
    kind: kindOf(file),
    mimeType: file.type,
    name: file.name,
  }
  await withStore("readwrite", (store) => store.put(record), "Couldn't replace that wallpaper.")
  return record
}

/** Every upload, oldest first. */
export async function listCustomBackgrounds(): Promise<CustomBackgroundRecord[]> {
  const records = await withStore<CustomBackgroundRecord[]>(
    "readonly",
    (store) => store.getAll(),
    "Couldn't load your wallpapers."
  )
  return (records ?? []).sort((a, b) => a.createdAt - b.createdAt)
}

/** How many uploads are stored - read fresh, so another open tab's upload counts too. */
export async function countCustomBackgrounds(): Promise<number> {
  return (
    (await withStore<number>("readonly", (store) => store.count(), "Couldn't count your wallpapers.")) ?? 0
  )
}

export async function deleteCustomBackground(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id), "Couldn't remove that wallpaper.")
}
