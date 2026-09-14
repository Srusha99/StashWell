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

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME)
      }
      db.createObjectStore(STORE_NAME, { keyPath: "id" })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function saveCustomBackground(file: File): Promise<CustomBackgroundRecord> {
  const kind: CustomBackgroundKind = file.type.startsWith("video/") ? "video" : "image"
  const record: CustomBackgroundRecord = {
    id: crypto.randomUUID(),
    blob: file,
    kind,
    mimeType: file.type,
    name: file.name,
    createdAt: Date.now(),
  }

  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    tx.objectStore(STORE_NAME).put(record)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
  return record
}

export async function listCustomBackgrounds(): Promise<CustomBackgroundRecord[]> {
  const db = await openDb()
  const records = await new Promise<CustomBackgroundRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly")
    const request = tx.objectStore(STORE_NAME).getAll()
    request.onsuccess = () => resolve(request.result ?? [])
    request.onerror = () => reject(request.error)
  })
  db.close()
  return records.sort((a, b) => a.createdAt - b.createdAt)
}

export async function deleteCustomBackground(id: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    tx.objectStore(STORE_NAME).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}
