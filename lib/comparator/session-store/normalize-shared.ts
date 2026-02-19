import type { ExpectedOutcome, NormalizedBBox, PredictedOutcome } from "@/lib/comparator/types"
import { isRecord, toFiniteNumber } from "@/lib/comparator/session-store/normalize-primitives"

export function normalizeBBox(value: unknown): NormalizedBBox | null {
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

export function normalizeExpectedOutcome(value: unknown): ExpectedOutcome {
  return value === "non-match" ? "non-match" : "match"
}

export function normalizePredictedOutcome(value: unknown): PredictedOutcome | null {
  if (value === "match" || value === "non-match") {
    return value
  }
  return null
}
