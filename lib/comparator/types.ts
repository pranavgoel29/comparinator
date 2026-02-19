export type NormalizedBBox = { x: number; y: number; width: number; height: number } // 0..1
export type PixelBBox = { x: number; y: number; width: number; height: number }

export type CompareImagePayload = {
  width: number
  height: number
  rgba: Uint8ClampedArray
}

export type CompareRequest = {
  source: CompareImagePayload
  target: CompareImagePayload
  modelIds: string[] // may be empty in pixel-only mode (embedding weight 0)
  weights: CompareWeights
}

export type CompareWeights = {
  embedding: number // 0..1
  pixel: number // 0..1
}

export type ModelLoadPhase =
  | "idle"
  | "metadata-loading"
  | "initializing"
  | "ready"
  | "error"

export type ModelRuntimeStatus = {
  modelId: string
  phase: ModelLoadPhase
  sizeBytes: number | null
  sizeSource: "huggingface-api" | "unknown"
  error: string | null
  updatedAt: number
}

export type ModelDownloadProgress = {
  modelId: string
  status: "initiate" | "progress" | "done"
  file: string | null
  progress: number | null
  loaded: number | null
  total: number | null
  updatedAt: number
}

export type PerModelScore = {
  modelId: string
  embeddingSimilarity: number // 0..1
  hybridSimilarity: number // 0..1
  latencyMs: number
  embeddingCacheHit: boolean
}

export type CompareResult = {
  embeddingSimilarity: number // 0..1
  pixelSimilarity: number // 0..1
  hybridSimilarity: number // 0..1
  compute: {
    embeddingSkipped: boolean
    pixelSkipped: boolean
  }
  aggregation: "minimum-across-models"
  usedWeights: CompareWeights
  perModelScores: PerModelScore[]
  timingsMs: {
    total: number
    pixel: number
    embedding: number
  }
  cacheStats: {
    pixelCacheHit: boolean
    embeddingHits: number
    embeddingMisses: number
  }
}

export type ModelInitResult = {
  loadedModelIds: string[]
  failedModels: Array<{ modelId: string; error: string }>
  modelStatuses: ModelRuntimeStatus[]
}

export type ExpectedOutcome = "match" | "non-match"

export type PredictedOutcome = "match" | "non-match"

export type BenchmarkPerModelOutcome = {
  modelId: string
  predictedOutcome: PredictedOutcome
  correct: boolean
  hybridSimilarity: number
  latencyMs: number
}

export type BenchmarkCaseOutcomeSnapshot = {
  caseId: string
  label: string
  status: "done" | "error"
  expectedOutcome: ExpectedOutcome
  predictedOutcome: PredictedOutcome | null
  correct: boolean | null
  hybridSimilarity: number | null
  totalLatencyMs: number | null
  error: string | null
  failingModels: string[]
  perModelOutcomes: BenchmarkPerModelOutcome[]
}

export type BenchmarkPerModelSummary = {
  modelId: string
  total: number
  correct: number
  incorrect: number
  correctnessRate: number
  avgLatencyMs: number | null
}

export type BenchmarkRunSnapshot = {
  savedAt: number
  threshold: number
  weights: CompareWeights
  modelIds: string[]
  totalCases: number
  processedCases: number
  correctCount: number
  incorrectCount: number
  caseOutcomes: BenchmarkCaseOutcomeSnapshot[]
  perModelSummary: BenchmarkPerModelSummary[]
}

export type WorkerRequest =
  | { type: "init-model"; payload: { modelIds: string[] } }
  | { type: "compare"; payload: CompareRequest }
  | { type: "clear-cache" }

export type WorkerResponse =
  | { type: "model-progress"; payload: ModelDownloadProgress }
  | { type: "model-status"; payload: ModelRuntimeStatus }
  | { type: "model-ready"; payload: ModelInitResult }
  | { type: "compare-result"; payload: CompareResult }
  | { type: "cache-cleared" }
  | { type: "error"; message: string }
