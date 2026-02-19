import type { BenchmarkRunSnapshot } from "@/lib/comparator/types"
import {
  normalizeExpectedOutcome,
  normalizePredictedOutcome,
} from "@/lib/comparator/session-store/normalize-shared"
import {
  isRecord,
  toBoolean,
  toFiniteNumber,
  toNonEmptyString,
} from "@/lib/comparator/session-store/normalize-primitives"

export function normalizeBenchmarkRunSnapshot(
  value: unknown
): BenchmarkRunSnapshot | null {
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
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0
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
          const status =
            item.status === "error"
              ? "error"
              : item.status === "done"
                ? "done"
                : null
          if (!caseId || !label || !status) {
            return null
          }

          const predictedOutcome =
            item.predictedOutcome === null
              ? null
              : normalizePredictedOutcome(item.predictedOutcome)
          const correct = item.correct === null ? null : toBoolean(item.correct)
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
                (entry): entry is string =>
                  typeof entry === "string" && entry.trim().length > 0
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
