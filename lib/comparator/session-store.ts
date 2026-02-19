import type { NormalizedBBox } from "@/lib/comparator/types"

export type PersistedBenchmarkPreset = "fast" | "balanced" | "thorough" | "custom"

export type PersistedImageSelectionV1 = {
  fileName: string
  imageBlob: Blob
  bbox: NormalizedBBox | null
  lockOnUpload: boolean
}

export type PersistedBenchmarkCaseV1 = {
  id: string
  label: string
  sourceName: string
  targetName: string
  sourceDataUrl: string
  targetDataUrl: string
  sourcePayload: {
    width: number
    height: number
    rgba: Uint8ClampedArray
  }
  targetPayload: {
    width: number
    height: number
    rgba: Uint8ClampedArray
  }
}

export type PersistedSessionV1 = {
  version: 1
  savedAt: number
  source: PersistedImageSelectionV1 | null
  target: PersistedImageSelectionV1 | null
  controls: {
    threshold: number
    embeddingWeight: number
    minAreaPixels: number
    maxCompareSide: number
    quickMode: boolean
    selectedPreset: PersistedBenchmarkPreset
    lastNonCustomPreset: Exclude<PersistedBenchmarkPreset, "custom"> | null
    selectedModelIds: string[]
  }
  benchmark: {
    cases: PersistedBenchmarkCaseV1[]
    selectedBenchmarkCaseId: string | null
  }
}

type PersistedSessionRecordV1 = PersistedSessionV1 & { id: typeof LATEST_SESSION_ID }

const DB_NAME = "comparinator-session-db"
const STORE_NAME = "sessions"
const DB_VERSION = 1
const LATEST_SESSION_ID = "latest"

function isRecord(input: unknown): input is Record<string, unknown> {
  return Boolean(input) && typeof input === "object"
}

function toFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function toNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null
}

function toBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null
}

function toUint8ClampedArray(value: unknown) {
  if (value instanceof Uint8ClampedArray) {
    return new Uint8ClampedArray(value)
  }

  if (Array.isArray(value)) {
    return new Uint8ClampedArray(value)
  }

  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView
    const copied = view.buffer.slice(
      view.byteOffset,
      view.byteOffset + view.byteLength
    )
    return new Uint8ClampedArray(copied)
  }

  return null
}

function normalizeBBox(value: unknown): NormalizedBBox | null {
  if (!isRecord(value)) {
    return null
  }

  const x = toFiniteNumber(value.x)
  const y = toFiniteNumber(value.y)
  const width = toFiniteNumber(value.width)
  const height = toFiniteNumber(value.height)
  if (
    x === null ||
    y === null ||
    width === null ||
    height === null ||
    width < 0 ||
    height < 0
  ) {
    return null
  }

  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
    width: Math.max(0, Math.min(1, width)),
    height: Math.max(0, Math.min(1, height)),
  }
}

function normalizeImageSelection(value: unknown): PersistedImageSelectionV1 | null {
  if (value === null) {
    return null
  }

  if (!isRecord(value)) {
    return null
  }

  const fileName = toNonEmptyString(value.fileName)
  const lockOnUpload = toBoolean(value.lockOnUpload)
  if (!fileName || lockOnUpload === null || !(value.imageBlob instanceof Blob)) {
    return null
  }

  return {
    fileName,
    imageBlob: value.imageBlob,
    bbox: value.bbox === null ? null : normalizeBBox(value.bbox),
    lockOnUpload,
  }
}

function normalizeBenchmarkCase(value: unknown): PersistedBenchmarkCaseV1 | null {
  if (!isRecord(value)) {
    return null
  }

  const id = toNonEmptyString(value.id)
  const label = toNonEmptyString(value.label)
  const sourceName = toNonEmptyString(value.sourceName)
  const targetName = toNonEmptyString(value.targetName)
  const sourceDataUrl = toNonEmptyString(value.sourceDataUrl)
  const targetDataUrl = toNonEmptyString(value.targetDataUrl)
  if (!id || !label || !sourceName || !targetName || !sourceDataUrl || !targetDataUrl) {
    return null
  }

  if (!isRecord(value.sourcePayload) || !isRecord(value.targetPayload)) {
    return null
  }

  const sourceWidth = toFiniteNumber(value.sourcePayload.width)
  const sourceHeight = toFiniteNumber(value.sourcePayload.height)
  const sourceRgba = toUint8ClampedArray(value.sourcePayload.rgba)
  const targetWidth = toFiniteNumber(value.targetPayload.width)
  const targetHeight = toFiniteNumber(value.targetPayload.height)
  const targetRgba = toUint8ClampedArray(value.targetPayload.rgba)

  if (
    sourceWidth === null ||
    sourceHeight === null ||
    !sourceRgba ||
    targetWidth === null ||
    targetHeight === null ||
    !targetRgba
  ) {
    return null
  }

  return {
    id,
    label,
    sourceName,
    targetName,
    sourceDataUrl,
    targetDataUrl,
    sourcePayload: {
      width: Math.max(1, Math.round(sourceWidth)),
      height: Math.max(1, Math.round(sourceHeight)),
      rgba: sourceRgba,
    },
    targetPayload: {
      width: Math.max(1, Math.round(targetWidth)),
      height: Math.max(1, Math.round(targetHeight)),
      rgba: targetRgba,
    },
  }
}

function normalizePreset(value: unknown): PersistedBenchmarkPreset {
  if (value === "fast" || value === "balanced" || value === "thorough" || value === "custom") {
    return value
  }
  return "custom"
}

function normalizeLastPreset(value: unknown): Exclude<PersistedBenchmarkPreset, "custom"> | null {
  if (value === "fast" || value === "balanced" || value === "thorough") {
    return value
  }
  return null
}

function normalizePersistedSession(value: unknown): PersistedSessionV1 | null {
  if (!isRecord(value)) {
    return null
  }

  if (value.version !== 1) {
    return null
  }

  if (!isRecord(value.controls) || !isRecord(value.benchmark)) {
    return null
  }

  const threshold = toFiniteNumber(value.controls.threshold)
  const embeddingWeight = toFiniteNumber(value.controls.embeddingWeight)
  const minAreaPixels = toFiniteNumber(value.controls.minAreaPixels)
  const maxCompareSide = toFiniteNumber(value.controls.maxCompareSide)
  const quickMode = toBoolean(value.controls.quickMode)
  const selectedModelIds = Array.isArray(value.controls.selectedModelIds)
    ? value.controls.selectedModelIds.filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0
      )
    : null
  const savedAt = toFiniteNumber(value.savedAt)

  if (
    threshold === null ||
    embeddingWeight === null ||
    minAreaPixels === null ||
    maxCompareSide === null ||
    quickMode === null ||
    !selectedModelIds ||
    !selectedModelIds.length ||
    savedAt === null
  ) {
    return null
  }

  const source = normalizeImageSelection(value.source)
  const target = normalizeImageSelection(value.target)
  if (value.source !== null && !source) {
    return null
  }
  if (value.target !== null && !target) {
    return null
  }

  const caseList = Array.isArray(value.benchmark.cases)
    ? value.benchmark.cases
        .map(normalizeBenchmarkCase)
        .filter((item): item is PersistedBenchmarkCaseV1 => item !== null)
    : null
  if (!caseList) {
    return null
  }

  const selectedBenchmarkCaseId =
    value.benchmark.selectedBenchmarkCaseId === null
      ? null
      : toNonEmptyString(value.benchmark.selectedBenchmarkCaseId)

  return {
    version: 1,
    savedAt,
    source,
    target,
    controls: {
      threshold,
      embeddingWeight,
      minAreaPixels: Math.max(8, Math.round(minAreaPixels)),
      maxCompareSide: Math.max(16, Math.round(maxCompareSide)),
      quickMode,
      selectedPreset: normalizePreset(value.controls.selectedPreset),
      lastNonCustomPreset: normalizeLastPreset(value.controls.lastNonCustomPreset),
      selectedModelIds: Array.from(new Set(selectedModelIds)),
    },
    benchmark: {
      cases: caseList,
      selectedBenchmarkCaseId,
    },
  }
}

function isIndexedDbAvailable() {
  return typeof indexedDB !== "undefined"
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."))
  })
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."))
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."))
  })
}

function openDatabase() {
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
