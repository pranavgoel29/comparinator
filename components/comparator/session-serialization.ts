import { MODEL_CONFIG } from "@/lib/comparator/model-config"
import { MODEL_SELECTION_MAX_MODELS, normalizeUniqueModelIds } from "@/lib/comparator/model-id"
import type { PersistedBenchmarkCaseV1 } from "@/lib/comparator/session-store"
import type { BenchmarkCase, BenchmarkPreset } from "@/components/comparator/comparator-types"

function unique(ids: string[]) {
  return normalizeUniqueModelIds(ids)
}

export function isBenchmarkPreset(value: unknown): value is BenchmarkPreset {
  return value === "fast" || value === "balanced" || value === "thorough" || value === "custom"
}

export function normalizeSelectedModelIdsFromSession(modelIds: string[]) {
  return modelIds.length
    ? unique(modelIds).slice(0, MODEL_SELECTION_MAX_MODELS)
    : [...MODEL_CONFIG.defaultModelIds]
}

export function toRuntimeBenchmarkCase(persisted: PersistedBenchmarkCaseV1): BenchmarkCase {
  return {
    id: persisted.id,
    label: persisted.label,
    sourceName: persisted.sourceName,
    targetName: persisted.targetName,
    sourceDataUrl: persisted.sourceDataUrl,
    targetDataUrl: persisted.targetDataUrl,
    sourcePayload: {
      width: persisted.sourcePayload.width,
      height: persisted.sourcePayload.height,
      rgba: new Uint8ClampedArray(persisted.sourcePayload.rgba),
    },
    targetPayload: {
      width: persisted.targetPayload.width,
      height: persisted.targetPayload.height,
      rgba: new Uint8ClampedArray(persisted.targetPayload.rgba),
    },
    status: persisted.status,
    result: persisted.result,
    error: persisted.error,
    durationMs: persisted.durationMs,
    expectedOutcome: persisted.expectedOutcome,
  }
}

export function toPersistedBenchmarkCase(caseItem: BenchmarkCase): PersistedBenchmarkCaseV1 {
  return {
    id: caseItem.id,
    label: caseItem.label,
    sourceName: caseItem.sourceName,
    targetName: caseItem.targetName,
    sourceDataUrl: caseItem.sourceDataUrl,
    targetDataUrl: caseItem.targetDataUrl,
    sourcePayload: {
      width: caseItem.sourcePayload.width,
      height: caseItem.sourcePayload.height,
      rgba: new Uint8ClampedArray(caseItem.sourcePayload.rgba),
    },
    targetPayload: {
      width: caseItem.targetPayload.width,
      height: caseItem.targetPayload.height,
      rgba: new Uint8ClampedArray(caseItem.targetPayload.rgba),
    },
    expectedOutcome: caseItem.expectedOutcome,
    status: caseItem.status,
    result: caseItem.result,
    error: caseItem.error,
    durationMs: caseItem.durationMs,
  }
}
