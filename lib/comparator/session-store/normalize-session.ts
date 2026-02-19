import type {
  PersistedBenchmarkPreset,
  PersistedImageSelectionV1,
  PersistedSessionV1,
} from "@/lib/comparator/session-store/types"
import {
  normalizeBBox,
  normalizeBenchmarkCase,
  normalizeBenchmarkRunSnapshot,
} from "@/lib/comparator/session-store/normalize-benchmark"
import {
  isRecord,
  toBoolean,
  toFiniteNumber,
  toNonEmptyString,
} from "@/lib/comparator/session-store/normalize-primitives"

function normalizePreset(value: unknown): PersistedBenchmarkPreset {
  if (
    value === "fast" ||
    value === "balanced" ||
    value === "thorough" ||
    value === "custom"
  ) {
    return value
  }
  return "custom"
}

function normalizeLastPreset(
  value: unknown
): Exclude<PersistedBenchmarkPreset, "custom"> | null {
  if (value === "fast" || value === "balanced" || value === "thorough") {
    return value
  }
  return null
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

export function normalizePersistedSession(value: unknown): PersistedSessionV1 | null {
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
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0
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
        .filter((item): item is NonNullable<typeof item> => item !== null)
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
