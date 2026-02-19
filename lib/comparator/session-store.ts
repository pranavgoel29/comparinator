import type {
  BenchmarkRunSnapshot,
  CompareResult,
  ExpectedOutcome,
  NormalizedBBox,
  PredictedOutcome,
} from "@/lib/comparator/types"

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
  expectedOutcome: ExpectedOutcome
  status: "idle" | "running" | "done" | "error"
  result: CompareResult | null
  error: string | null
  durationMs: number | null
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
    latestRunSnapshot: BenchmarkRunSnapshot | null
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
    expectedOutcome: normalizeExpectedOutcome(value.expectedOutcome),
    status:
      value.status === "running" ||
      value.status === "done" ||
      value.status === "error"
        ? value.status
        : "idle",
    result: normalizeCompareResult(value.result),
    error: toNonEmptyString(value.error) ?? null,
    durationMs: (() => {
      if (value.durationMs === null || value.durationMs === undefined) {
        return null
      }
      const duration = toFiniteNumber(value.durationMs)
      return duration === null ? null : Math.max(0, Math.round(duration))
    })(),
  }
}

function normalizeCompareResult(value: unknown): CompareResult | null {
  if (!isRecord(value)) {
    return null
  }
  const embeddingSimilarity = toFiniteNumber(value.embeddingSimilarity)
  const pixelSimilarity = toFiniteNumber(value.pixelSimilarity)
  const hybridSimilarity = toFiniteNumber(value.hybridSimilarity)
  if (
    embeddingSimilarity === null ||
    pixelSimilarity === null ||
    hybridSimilarity === null ||
    !isRecord(value.compute) ||
    !isRecord(value.usedWeights) ||
    !isRecord(value.timingsMs) ||
    !isRecord(value.cacheStats) ||
    !Array.isArray(value.perModelScores)
  ) {
    return null
  }

  const computeEmbeddingSkipped = toBoolean(value.compute.embeddingSkipped)
  const computePixelSkipped = toBoolean(value.compute.pixelSkipped)
  const weightEmbedding = toFiniteNumber(value.usedWeights.embedding)
  const weightPixel = toFiniteNumber(value.usedWeights.pixel)
  const timingTotal = toFiniteNumber(value.timingsMs.total)
  const timingPixel = toFiniteNumber(value.timingsMs.pixel)
  const timingEmbedding = toFiniteNumber(value.timingsMs.embedding)
  const cachePixelHit = toBoolean(value.cacheStats.pixelCacheHit)
  const cacheEmbeddingHits = toFiniteNumber(value.cacheStats.embeddingHits)
  const cacheEmbeddingMisses = toFiniteNumber(value.cacheStats.embeddingMisses)
  if (
    computeEmbeddingSkipped === null ||
    computePixelSkipped === null ||
    weightEmbedding === null ||
    weightPixel === null ||
    timingTotal === null ||
    timingPixel === null ||
    timingEmbedding === null ||
    cachePixelHit === null ||
    cacheEmbeddingHits === null ||
    cacheEmbeddingMisses === null
  ) {
    return null
  }

  const perModelScores = value.perModelScores
    .map((entry) => {
      if (!isRecord(entry)) {
        return null
      }
      const modelId = toNonEmptyString(entry.modelId)
      const modelEmbedding = toFiniteNumber(entry.embeddingSimilarity)
      const modelHybrid = toFiniteNumber(entry.hybridSimilarity)
      const modelLatency = toFiniteNumber(entry.latencyMs)
      const modelCacheHit = toBoolean(entry.embeddingCacheHit)
      if (
        !modelId ||
        modelEmbedding === null ||
        modelHybrid === null ||
        modelLatency === null ||
        modelCacheHit === null
      ) {
        return null
      }
      return {
        modelId,
        embeddingSimilarity: modelEmbedding,
        hybridSimilarity: modelHybrid,
        latencyMs: Math.max(0, Math.round(modelLatency)),
        embeddingCacheHit: modelCacheHit,
      }
    })
    .filter((entry): entry is NonNullable<CompareResult["perModelScores"][number]> => entry !== null)

  return {
    embeddingSimilarity,
    pixelSimilarity,
    hybridSimilarity,
    compute: {
      embeddingSkipped: computeEmbeddingSkipped,
      pixelSkipped: computePixelSkipped,
    },
    aggregation:
      value.aggregation === "minimum-across-models"
        ? "minimum-across-models"
        : "minimum-across-models",
    usedWeights: {
      embedding: Math.max(0, weightEmbedding),
      pixel: Math.max(0, weightPixel),
    },
    perModelScores,
    timingsMs: {
      total: Math.max(0, Math.round(timingTotal)),
      pixel: Math.max(0, Math.round(timingPixel)),
      embedding: Math.max(0, Math.round(timingEmbedding)),
    },
    cacheStats: {
      pixelCacheHit: cachePixelHit,
      embeddingHits: Math.max(0, Math.round(cacheEmbeddingHits)),
      embeddingMisses: Math.max(0, Math.round(cacheEmbeddingMisses)),
    },
  }
}

function normalizeExpectedOutcome(value: unknown): ExpectedOutcome {
  return value === "non-match" ? "non-match" : "match"
}

function normalizePredictedOutcome(value: unknown): PredictedOutcome | null {
  if (value === "match" || value === "non-match") {
    return value
  }
  return null
}

function normalizeBenchmarkRunSnapshot(value: unknown): BenchmarkRunSnapshot | null {
  if (!isRecord(value)) {
    return null
  }

  const savedAt = toFiniteNumber(value.savedAt)
  const threshold = toFiniteNumber(value.threshold)
  const totalCases = toFiniteNumber(value.totalCases)
  const processedCases = toFiniteNumber(value.processedCases)
  const correctCount = toFiniteNumber(value.correctCount)
  const incorrectCount = toFiniteNumber(value.incorrectCount)

  if (
    savedAt === null ||
    threshold === null ||
    totalCases === null ||
    processedCases === null ||
    correctCount === null ||
    incorrectCount === null ||
    !isRecord(value.weights)
  ) {
    return null
  }

  const embeddingWeight = toFiniteNumber(value.weights.embedding)
  const pixelWeight = toFiniteNumber(value.weights.pixel)
  const modelIds = Array.isArray(value.modelIds)
    ? value.modelIds.filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0
      )
    : null
  if (embeddingWeight === null || pixelWeight === null || !modelIds) {
    return null
  }

  const caseOutcomes = Array.isArray(value.caseOutcomes)
    ? value.caseOutcomes
        .map((item) => {
          if (!isRecord(item)) {
            return null
          }

          const caseId = toNonEmptyString(item.caseId)
          const label = toNonEmptyString(item.label)
          const status = item.status === "error" ? "error" : item.status === "done" ? "done" : null
          if (!caseId || !label || !status) {
            return null
          }

          const predictedOutcome =
            item.predictedOutcome === null
              ? null
              : normalizePredictedOutcome(item.predictedOutcome)
          const correct =
            item.correct === null
              ? null
              : toBoolean(item.correct)
          const hybridSimilarity =
            item.hybridSimilarity === null
              ? null
              : toFiniteNumber(item.hybridSimilarity)
          const totalLatencyMs =
            item.totalLatencyMs === null
              ? null
              : toFiniteNumber(item.totalLatencyMs)

          if (
            (item.predictedOutcome !== null && predictedOutcome === null) ||
            (item.correct !== null && correct === null) ||
            (item.hybridSimilarity !== null && hybridSimilarity === null) ||
            (item.totalLatencyMs !== null && totalLatencyMs === null)
          ) {
            return null
          }

          const failingModels = Array.isArray(item.failingModels)
            ? item.failingModels.filter(
                (value): value is string =>
                  typeof value === "string" && value.trim().length > 0
              )
            : []
          const perModelOutcomes = Array.isArray(item.perModelOutcomes)
            ? item.perModelOutcomes
                .map((modelOutcome) => {
                  if (!isRecord(modelOutcome)) {
                    return null
                  }
                  const modelId = toNonEmptyString(modelOutcome.modelId)
                  const predicted = normalizePredictedOutcome(
                    modelOutcome.predictedOutcome
                  )
                  const modelCorrect = toBoolean(modelOutcome.correct)
                  const modelHybrid = toFiniteNumber(modelOutcome.hybridSimilarity)
                  const latencyMs = toFiniteNumber(modelOutcome.latencyMs)
                  if (
                    !modelId ||
                    !predicted ||
                    modelCorrect === null ||
                    modelHybrid === null ||
                    latencyMs === null
                  ) {
                    return null
                  }
                  return {
                    modelId,
                    predictedOutcome: predicted,
                    correct: modelCorrect,
                    hybridSimilarity: modelHybrid,
                    latencyMs: Math.max(0, Math.round(latencyMs)),
                  }
                })
                .filter(
                  (entry): entry is NonNullable<
                    BenchmarkRunSnapshot["caseOutcomes"][number]["perModelOutcomes"][number]
                  > => entry !== null
                )
            : []

          return {
            caseId,
            label,
            status,
            expectedOutcome: normalizeExpectedOutcome(item.expectedOutcome),
            predictedOutcome,
            correct,
            hybridSimilarity,
            totalLatencyMs:
              totalLatencyMs === null ? null : Math.max(0, Math.round(totalLatencyMs)),
            error: toNonEmptyString(item.error) ?? null,
            failingModels: Array.from(new Set(failingModels)),
            perModelOutcomes,
          }
        })
        .filter(
          (
            item
          ): item is NonNullable<BenchmarkRunSnapshot["caseOutcomes"][number]> =>
            item !== null
        )
    : null

  const perModelSummary = Array.isArray(value.perModelSummary)
    ? value.perModelSummary
        .map((item) => {
          if (!isRecord(item)) {
            return null
          }
          const modelId = toNonEmptyString(item.modelId)
          const total = toFiniteNumber(item.total)
          const correct = toFiniteNumber(item.correct)
          const incorrect = toFiniteNumber(item.incorrect)
          const correctnessRate = toFiniteNumber(item.correctnessRate)
          const avgLatencyMs =
            item.avgLatencyMs === null ? null : toFiniteNumber(item.avgLatencyMs)
          if (
            !modelId ||
            total === null ||
            correct === null ||
            incorrect === null ||
            correctnessRate === null ||
            (item.avgLatencyMs !== null && avgLatencyMs === null)
          ) {
            return null
          }

          return {
            modelId,
            total: Math.max(0, Math.round(total)),
            correct: Math.max(0, Math.round(correct)),
            incorrect: Math.max(0, Math.round(incorrect)),
            correctnessRate: Math.max(0, Math.min(1, correctnessRate)),
            avgLatencyMs:
              avgLatencyMs === null ? null : Math.max(0, Math.round(avgLatencyMs)),
          }
        })
        .filter(
          (
            item
          ): item is NonNullable<BenchmarkRunSnapshot["perModelSummary"][number]> =>
            item !== null
        )
    : null

  if (!caseOutcomes || !perModelSummary) {
    return null
  }

  return {
    savedAt,
    threshold: Math.max(0, Math.min(1, threshold)),
    weights: {
      embedding: Math.max(0, embeddingWeight),
      pixel: Math.max(0, pixelWeight),
    },
    modelIds: Array.from(new Set(modelIds)),
    totalCases: Math.max(0, Math.round(totalCases)),
    processedCases: Math.max(0, Math.round(processedCases)),
    correctCount: Math.max(0, Math.round(correctCount)),
    incorrectCount: Math.max(0, Math.round(incorrectCount)),
    caseOutcomes,
    perModelSummary,
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
  const latestRunSnapshot =
    value.benchmark.latestRunSnapshot === null ||
    value.benchmark.latestRunSnapshot === undefined
      ? null
      : normalizeBenchmarkRunSnapshot(value.benchmark.latestRunSnapshot)

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
      latestRunSnapshot,
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
