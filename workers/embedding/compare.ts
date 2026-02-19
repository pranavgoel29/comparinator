import { RawImage } from "@huggingface/transformers"

import {
  cosineSimilarity,
  hybridSimilarity,
  pixelSimilarity,
} from "@/lib/comparator/metrics"
import { normalizeUniqueModelIds } from "@/lib/comparator/model-id"
import type {
  CompareImagePayload,
  CompareResult,
  CompareWeights,
  PerModelScore,
} from "@/lib/comparator/types"
import {
  EMBEDDING_CACHE_LIMIT,
  PIXEL_CACHE_LIMIT,
} from "@/workers/embedding/constants"
import {
  elapsedMs,
  getCachedValue,
  hashBytes,
  normalizeWeights,
  nowMs,
  setCachedValue,
} from "@/workers/embedding/cache"
import { getExtractor } from "@/workers/embedding/model-init"
import { embeddingCache, pixelCache } from "@/workers/embedding/runtime"
import { toVector } from "@/workers/embedding/vector"

function imageDataFromPayload(payload: CompareImagePayload) {
  const rgba = new Uint8ClampedArray(payload.rgba)
  return new ImageData(rgba, payload.width, payload.height)
}

async function rawImageFromPayload(payload: CompareImagePayload) {
  const canvas = new OffscreenCanvas(payload.width, payload.height)
  const ctx = canvas.getContext("2d")

  if (!ctx) {
    throw new Error("Could not initialize worker canvas context.")
  }

  ctx.putImageData(imageDataFromPayload(payload), 0, 0)
  const blob = await canvas.convertToBlob({ type: "image/png" })
  return RawImage.fromBlob(blob)
}

async function compareWithModel(
  modelId: string,
  sourceImageKey: string,
  targetImageKey: string,
  getSourceRawImage: () => Promise<RawImage>,
  getTargetRawImage: () => Promise<RawImage>,
  pixel: number,
  weights: CompareWeights,
  cacheCounter: { embeddingHits: number; embeddingMisses: number }
): Promise<PerModelScore> {
  const started = nowMs()
  const sourceCacheKey = `${modelId}|${sourceImageKey}`
  const targetCacheKey = `${modelId}|${targetImageKey}`

  let sourceVector = getCachedValue(embeddingCache, sourceCacheKey)
  let targetVector = getCachedValue(embeddingCache, targetCacheKey)
  const sourceCacheHit = Boolean(sourceVector)
  const targetCacheHit = Boolean(targetVector)

  cacheCounter.embeddingHits += sourceCacheHit ? 1 : 0
  cacheCounter.embeddingHits += targetCacheHit ? 1 : 0
  cacheCounter.embeddingMisses += sourceCacheHit ? 0 : 1
  cacheCounter.embeddingMisses += targetCacheHit ? 0 : 1

  if (!sourceVector || !targetVector) {
    const extractor = await getExtractor(modelId)

    const [sourceFeatures, targetFeatures] = await Promise.all([
      sourceVector
        ? Promise.resolve<unknown>(null)
        : extractor(await getSourceRawImage(), { pooling: "mean", normalize: true }),
      targetVector
        ? Promise.resolve<unknown>(null)
        : extractor(await getTargetRawImage(), { pooling: "mean", normalize: true }),
    ])

    if (!sourceVector && sourceFeatures) {
      sourceVector = toVector(sourceFeatures)
      setCachedValue(embeddingCache, sourceCacheKey, sourceVector, EMBEDDING_CACHE_LIMIT)
    }

    if (!targetVector && targetFeatures) {
      targetVector = toVector(targetFeatures)
      setCachedValue(embeddingCache, targetCacheKey, targetVector, EMBEDDING_CACHE_LIMIT)
    }
  }

  if (!sourceVector || !targetVector) {
    throw new Error("Embedding extraction returned empty vectors.")
  }

  const embedding = cosineSimilarity(sourceVector, targetVector)

  return {
    modelId,
    embeddingSimilarity: embedding,
    hybridSimilarity: hybridSimilarity(embedding, pixel, weights),
    latencyMs: elapsedMs(started),
    embeddingCacheHit: sourceCacheHit && targetCacheHit,
  }
}

export async function compareRegions(
  source: CompareImagePayload,
  target: CompareImagePayload,
  modelIds: string[],
  weights: CompareWeights
): Promise<CompareResult> {
  const totalStarted = nowMs()
  const normalizedWeights = normalizeWeights(weights)
  const embeddingRequired = normalizedWeights.embedding > 0
  const pixelRequired = normalizedWeights.pixel > 0
  const ids = normalizeUniqueModelIds(modelIds)

  if (embeddingRequired && !ids.length) {
    throw new Error("Select at least one model before compare.")
  }

  const sourceImageKey = hashBytes(source.rgba)
  const targetImageKey = hashBytes(target.rgba)
  const sourceTargetPairKey = `${sourceImageKey}|${targetImageKey}`

  let sourceRawImagePromise: Promise<RawImage> | null = null
  let targetRawImagePromise: Promise<RawImage> | null = null

  const getSourceRawImage = () => {
    if (!sourceRawImagePromise) {
      sourceRawImagePromise = rawImageFromPayload(source)
    }
    return sourceRawImagePromise
  }

  const getTargetRawImage = () => {
    if (!targetRawImagePromise) {
      targetRawImagePromise = rawImageFromPayload(target)
    }
    return targetRawImagePromise
  }

  const pixelStarted = nowMs()
  let pixelSimilarityScore = 0
  let pixelCacheHit = false

  if (pixelRequired) {
    let pixel = getCachedValue(pixelCache, sourceTargetPairKey)
    pixelCacheHit = typeof pixel === "number"

    if (typeof pixel !== "number") {
      const sourceImageData = imageDataFromPayload(source)
      const targetImageData = imageDataFromPayload(target)
      pixel = pixelSimilarity(sourceImageData, targetImageData)
      setCachedValue(pixelCache, sourceTargetPairKey, pixel, PIXEL_CACHE_LIMIT)
    }

    pixelSimilarityScore = typeof pixel === "number" ? pixel : 0
  }

  const pixelTimingMs = pixelRequired ? elapsedMs(pixelStarted) : 0
  const embeddingStarted = nowMs()
  const cacheCounter = { embeddingHits: 0, embeddingMisses: 0 }
  const perModelScores: PerModelScore[] = []
  let embeddingSimilarityScore = 0
  let hybrid = hybridSimilarity(embeddingSimilarityScore, pixelSimilarityScore, normalizedWeights)

  if (embeddingRequired) {
    const perModelSettled = await Promise.allSettled(
      ids.map((modelId) =>
        compareWithModel(
          modelId,
          sourceImageKey,
          targetImageKey,
          getSourceRawImage,
          getTargetRawImage,
          pixelSimilarityScore,
          normalizedWeights,
          cacheCounter
        )
      )
    )

    const errors: string[] = []

    for (let index = 0; index < perModelSettled.length; index += 1) {
      const settled = perModelSettled[index]
      const modelId = ids[index]

      if (settled.status === "fulfilled") {
        perModelScores.push(settled.value)
        continue
      }

      const reason =
        settled.reason instanceof Error ? settled.reason.message : "Model compare failed"
      errors.push(`${modelId}: ${reason}`)
    }

    if (!perModelScores.length) {
      throw new Error(`All selected models failed. ${errors.join(" | ")}`)
    }

    embeddingSimilarityScore = Math.min(...perModelScores.map((item) => item.embeddingSimilarity))
    hybrid = Math.min(...perModelScores.map((item) => item.hybridSimilarity))
  }

  const embeddingTimingMs = embeddingRequired ? elapsedMs(embeddingStarted) : 0

  return {
    embeddingSimilarity: embeddingSimilarityScore,
    pixelSimilarity: pixelSimilarityScore,
    hybridSimilarity: hybrid,
    compute: {
      embeddingSkipped: !embeddingRequired,
      pixelSkipped: !pixelRequired,
    },
    aggregation: "minimum-across-models",
    usedWeights: normalizedWeights,
    perModelScores,
    timingsMs: {
      total: elapsedMs(totalStarted),
      pixel: pixelTimingMs,
      embedding: embeddingTimingMs,
    },
    cacheStats: {
      pixelCacheHit,
      embeddingHits: cacheCounter.embeddingHits,
      embeddingMisses: cacheCounter.embeddingMisses,
    },
  }
}
