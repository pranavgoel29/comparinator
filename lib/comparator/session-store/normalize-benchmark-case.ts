import type { PersistedBenchmarkCaseV1 } from "@/lib/comparator/session-store/types"
import { normalizeCompareResult } from "@/lib/comparator/session-store/normalize-compare-result"
import { normalizeExpectedOutcome } from "@/lib/comparator/session-store/normalize-shared"
import {
  isRecord,
  toFiniteNumber,
  toNonEmptyString,
  toUint8ClampedArray,
} from "@/lib/comparator/session-store/normalize-primitives"

export function normalizeBenchmarkCase(value: unknown): PersistedBenchmarkCaseV1 | null {
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
