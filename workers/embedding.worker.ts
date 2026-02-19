/// <reference lib="webworker" />

import { RawImage, env, pipeline } from "@huggingface/transformers"

import { MODEL_CONFIG } from "@/lib/comparator/model-config"
import { cosineSimilarity, hybridSimilarity, pixelSimilarity } from "@/lib/comparator/metrics"
import type {
  CompareImagePayload,
  CompareWeights,
  CompareResult,
  PerModelScore,
  WorkerRequest,
  WorkerResponse,
} from "@/lib/comparator/types"

env.allowLocalModels = false

type FeatureExtractor = (
  input: unknown,
  options?: Record<string, unknown>
) => Promise<unknown>

const extractorPromises = new Map<string, Promise<FeatureExtractor>>()
const embeddingCache = new Map<string, number[]>()
const pixelCache = new Map<string, number>()
const EMBEDDING_CACHE_LIMIT = 512
const PIXEL_CACHE_LIMIT = 512

const createPipeline = pipeline as unknown as (
  task: string,
  model: string,
  options: Record<string, unknown>
) => Promise<FeatureExtractor>

function postMessageSafe(message: WorkerResponse) {
  self.postMessage(message)
}

function uniqueModelIds(modelIds: string[]) {
  return Array.from(
    new Set(modelIds.map((value) => value.trim()).filter(Boolean))
  )
}

function nowMs() {
  return performance.now()
}

function elapsedMs(started: number) {
  return Math.max(0, Math.round(nowMs() - started))
}

function hashBytes(bytes: Uint8ClampedArray) {
  let hash = 2166136261
  for (let index = 0; index < bytes.length; index += 1) {
    hash ^= bytes[index]
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function getCachedValue<T>(cache: Map<string, T>, key: string) {
  const value = cache.get(key)
  if (value === undefined) {
    return undefined
  }

  cache.delete(key)
  cache.set(key, value)
  return value
}

function setCachedValue<T>(
  cache: Map<string, T>,
  key: string,
  value: T,
  limit: number
) {
  if (cache.has(key)) {
    cache.delete(key)
  }
  cache.set(key, value)

  while (cache.size > limit) {
    const oldestKey = cache.keys().next().value
    if (typeof oldestKey === "string") {
      cache.delete(oldestKey)
      continue
    }
    break
  }
}

function normalizeWeights(input: CompareWeights): CompareWeights {
  const embedding = Number.isFinite(input.embedding)
    ? Math.max(0, input.embedding)
    : 0
  const pixel = Number.isFinite(input.pixel) ? Math.max(0, input.pixel) : 0

  if (embedding === 0 && pixel === 0) {
    return { embedding: 0.5, pixel: 0.5 }
  }

  return { embedding, pixel }
}

async function getExtractor(modelId: string) {
  const existing = extractorPromises.get(modelId)
  if (existing) {
    return existing
  }

  const promise = createPipeline(MODEL_CONFIG.task, modelId, {
    quantized: MODEL_CONFIG.quantized,
  })

  extractorPromises.set(modelId, promise)
  return promise
}

async function initModels(modelIds: string[]) {
  const ids = uniqueModelIds(modelIds)
  if (!ids.length) {
    throw new Error("Select at least one model.")
  }

  const loadedModelIds: string[] = []
  const failedModels: Array<{ modelId: string; error: string }> = []

  const settled = await Promise.allSettled(
    ids.map(async (modelId) => {
      await getExtractor(modelId)
      return modelId
    })
  )

  for (let index = 0; index < settled.length; index += 1) {
    const result = settled[index]
    const modelId = ids[index]

    if (result.status === "fulfilled") {
      loadedModelIds.push(modelId)
      continue
    }

    const reason =
      result.reason instanceof Error
        ? result.reason.message
        : "Failed to initialize model"

    failedModels.push({ modelId, error: reason })
    extractorPromises.delete(modelId)
  }

  if (!loadedModelIds.length) {
    throw new Error(
      failedModels.length
        ? `Model initialization failed: ${failedModels[0].modelId}`
        : "Model initialization failed."
    )
  }

  return { loadedModelIds, failedModels }
}

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

function viewToNumberArray(view: ArrayBufferView): number[] {
  if ("length" in view) {
    return Array.from(view as unknown as ArrayLike<number>)
  }

  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
  return Array.from(bytes)
}

function toVector(output: unknown): number[] {
  const tensorLike = output as { data?: unknown; tolist?: () => unknown }

  if (tensorLike?.data && ArrayBuffer.isView(tensorLike.data)) {
    return viewToNumberArray(tensorLike.data)
  }

  if (ArrayBuffer.isView(output)) {
    return viewToNumberArray(output)
  }

  if (Array.isArray(output)) {
    return output.flat(Infinity) as number[]
  }

  if (typeof tensorLike?.tolist === "function") {
    const list = tensorLike.tolist()
    if (Array.isArray(list)) {
      return list.flat(Infinity) as number[]
    }
  }

  throw new Error("Unsupported embedding output format.")
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
      setCachedValue(
        embeddingCache,
        sourceCacheKey,
        sourceVector,
        EMBEDDING_CACHE_LIMIT
      )
    }

    if (!targetVector && targetFeatures) {
      targetVector = toVector(targetFeatures)
      setCachedValue(
        embeddingCache,
        targetCacheKey,
        targetVector,
        EMBEDDING_CACHE_LIMIT
      )
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

async function compareRegions(
  source: CompareImagePayload,
  target: CompareImagePayload,
  modelIds: string[],
  weights: CompareWeights
): Promise<CompareResult> {
  const totalStarted = nowMs()
  const normalizedWeights = normalizeWeights(weights)
  const embeddingRequired = normalizedWeights.embedding > 0
  const pixelRequired = normalizedWeights.pixel > 0
  const ids = uniqueModelIds(modelIds)
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
  let hybrid = hybridSimilarity(
    embeddingSimilarityScore,
    pixelSimilarityScore,
    normalizedWeights
  )

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
        settled.reason instanceof Error
          ? settled.reason.message
          : "Model compare failed"

      errors.push(`${modelId}: ${reason}`)
    }

    if (!perModelScores.length) {
      throw new Error(`All selected models failed. ${errors.join(" | ")}`)
    }

    embeddingSimilarityScore = Math.min(
      ...perModelScores.map((item) => item.embeddingSimilarity)
    )
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

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  try {
    if (event.data.type === "init-model") {
      const initialized = await initModels(event.data.payload.modelIds)
      postMessageSafe({ type: "model-ready", payload: initialized })
      return
    }

    if (event.data.type === "clear-cache") {
      embeddingCache.clear()
      pixelCache.clear()
      postMessageSafe({ type: "cache-cleared" })
      return
    }

    if (event.data.type === "compare") {
      const payload = event.data.payload
      if (
        !payload?.source ||
        !payload?.target ||
        !payload.source.width ||
        !payload.source.height ||
        !payload.target.width ||
        !payload.target.height ||
        !payload.source.rgba?.length ||
        !payload.target.rgba?.length ||
        !Array.isArray(payload?.modelIds) ||
        !payload?.weights
      ) {
        throw new Error("Invalid compare payload.")
      }

      const result = await compareRegions(
        payload.source,
        payload.target,
        payload.modelIds,
        payload.weights
      )

      postMessageSafe({ type: "compare-result", payload: result })
      return
    }

    throw new Error("Unsupported worker message type.")
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown worker error"

    postMessageSafe({ type: "error", message })
  }
}
