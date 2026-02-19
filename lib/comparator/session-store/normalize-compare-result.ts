import type { CompareResult } from "@/lib/comparator/types"
import {
  isRecord,
  toBoolean,
  toFiniteNumber,
  toNonEmptyString,
} from "@/lib/comparator/session-store/normalize-primitives"

export function normalizeCompareResult(value: unknown): CompareResult | null {
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
    .filter(
      (entry): entry is NonNullable<CompareResult["perModelScores"][number]> =>
        entry !== null
    )

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
