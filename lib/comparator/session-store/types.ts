import type {
  BenchmarkRunSnapshot,
  CompareResult,
  ExpectedOutcome,
  NormalizedBBox,
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

export const DB_NAME = "comparinator-session-db"
export const STORE_NAME = "sessions"
export const DB_VERSION = 1
export const LATEST_SESSION_ID = "latest"

export type PersistedSessionRecordV1 = PersistedSessionV1 & {
  id: typeof LATEST_SESSION_ID
}
