import { normalizePersistedSession } from "@/lib/comparator/session-store/normalize-session"
import {
  isIndexedDbAvailable,
  openDatabase,
  requestToPromise,
  transactionDone,
} from "@/lib/comparator/session-store/indexeddb"
import {
  LATEST_SESSION_ID,
  STORE_NAME,
  type PersistedSessionRecordV1,
  type PersistedSessionV1,
} from "@/lib/comparator/session-store/types"

export type {
  PersistedBenchmarkCaseV1,
  PersistedBenchmarkPreset,
  PersistedImageSelectionV1,
  PersistedSessionV1,
} from "@/lib/comparator/session-store/types"

export async function saveLatestSession(payload: PersistedSessionV1) {
  if (!isIndexedDbAvailable()) {
    throw new Error("IndexedDB is unavailable in this browser.")
  }

  const db = await openDatabase()
  try {
    const transaction = db.transaction(STORE_NAME, "readwrite")
    const store = transaction.objectStore(STORE_NAME)
    const record: PersistedSessionRecordV1 = {
      id: LATEST_SESSION_ID,
      ...payload,
    }
    store.put(record)
    await transactionDone(transaction)
  } finally {
    db.close()
  }
}

export async function loadLatestSession() {
  if (!isIndexedDbAvailable()) {
    return null
  }

  const db = await openDatabase()
  try {
    const transaction = db.transaction(STORE_NAME, "readonly")
    const store = transaction.objectStore(STORE_NAME)
    const rawRecord = await requestToPromise(store.get(LATEST_SESSION_ID))
    await transactionDone(transaction)
    return normalizePersistedSession(rawRecord)
  } finally {
    db.close()
  }
}

export async function clearLatestSession() {
  if (!isIndexedDbAvailable()) {
    return
  }

  const db = await openDatabase()
  try {
    const transaction = db.transaction(STORE_NAME, "readwrite")
    const store = transaction.objectStore(STORE_NAME)
    store.delete(LATEST_SESSION_ID)
    await transactionDone(transaction)
  } finally {
    db.close()
  }
}
