import type {
  BenchmarkRunSnapshot,
  CompareResult,
  CompareRequest,
  ExpectedOutcome,
  ModelLoadPhase,
} from "@/lib/comparator/types"
import { MODEL_CATALOG } from "@/lib/comparator/model-config"

export const DEFAULT_THRESHOLD = 0.85
export const DEFAULT_MAX_COMPARE_SIDE = 224
export const SESSION_SAVE_DEBOUNCE_MS = 400
export const DEFAULT_EXPECTED_OUTCOME: ExpectedOutcome = "match"

export type ModelStatus = "idle" | "loading" | "ready" | "error"
export type BenchmarkCaseStatus = "idle" | "running" | "done" | "error"
export type BenchmarkPreset = "fast" | "balanced" | "thorough" | "custom"

export type BenchmarkCase = {
  id: string
  label: string
  sourceName: string
  targetName: string
  sourceDataUrl: string
  targetDataUrl: string
  sourcePayload: CompareRequest["source"]
  targetPayload: CompareRequest["target"]
  status: BenchmarkCaseStatus
  result: CompareResult | null
  error: string | null
  durationMs: number | null
  expectedOutcome: ExpectedOutcome
}

export type ModelStatusRow = {
  modelId: string
  phase: ModelLoadPhase
  sizeBytes: number | null
  sizeSource: "huggingface-api" | "unknown"
  error: string | null
  updatedAt: number
  progress: number | null
  progressFile: string | null
  progressLoaded: number | null
  progressTotal: number | null
}

export type BenchmarkStats = {
  total: number
  finished: number
  processedCount: number
  runningCount: number
  errorCount: number
  progress: number
  passCount: number
  failCount: number
  passRate: number
  avgHybrid: number
  minHybrid: number
  maxHybrid: number
  avgDuration: number | null
  bestCase: (BenchmarkCase & { result: CompareResult }) | null
  worstCase: (BenchmarkCase & { result: CompareResult }) | null
}

export type ComparatorAnalyticsSnapshot = BenchmarkRunSnapshot | null

export const PRESET_MODEL_IDS: Record<Exclude<BenchmarkPreset, "custom">, string[]> = {
  fast: ["Xenova/siglip-base-patch16-224"],
  balanced: [
    "Xenova/siglip-base-patch16-224",
    "onnx-community/siglip2-base-patch16-224-ONNX",
  ],
  thorough: MODEL_CATALOG.map((model) => model.id),
}

export const PRESET_COMPARE_SIZE: Record<Exclude<BenchmarkPreset, "custom">, number> = {
  fast: 160,
  balanced: 224,
  thorough: 320,
}

export const PRESET_QUICK_MODE: Record<Exclude<BenchmarkPreset, "custom">, boolean> = {
  fast: true,
  balanced: false,
  thorough: false,
}
