import { DB_NAME, DB_VERSION, STORE_NAME } from "@/lib/comparator/session-store/types"

export function isIndexedDbAvailable() {
  return typeof indexedDB !== "undefined"
}

export function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed."))
  })
}

export function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."))
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."))
  })
}

export function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!isIndexedDbAvailable()) {
      reject(new Error("IndexedDB is unavailable in this browser."))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error("Failed to open IndexedDB database."))
  })
}
