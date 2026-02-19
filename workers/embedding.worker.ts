/// <reference lib="webworker" />

import { RawImage, env, pipeline } from "@huggingface/transformers"

import { MODEL_CONFIG } from "@/lib/comparator/model-config"
import { cosineSimilarity, hybridSimilarity, pixelSimilarity } from "@/lib/comparator/metrics"
import type {
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

async function decodeDataUrl(dataUrl: string) {
  const response = await fetch(dataUrl)
  if (!response.ok) {
    throw new Error("Could not decode image data URL.")
  }

  const blob = await response.blob()
  const [bitmap, rawImage] = await Promise.all([
    createImageBitmap(blob),
    RawImage.fromBlob(blob),
  ])

  return { bitmap, rawImage }
}

function imageDataFromBitmap(
  bitmap: ImageBitmap,
  width = bitmap.width,
  height = bitmap.height
) {
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext("2d")

  if (!ctx) {
    throw new Error("Could not initialize worker canvas context.")
  }

  ctx.drawImage(bitmap, 0, 0, width, height)
  return ctx.getImageData(0, 0, width, height)
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
  sourceRawImage: RawImage,
  targetRawImage: RawImage,
  pixel: number,
  weights: CompareWeights
): Promise<PerModelScore> {
  const extractor = await getExtractor(modelId)

  const [sourceFeatures, targetFeatures] = await Promise.all([
    extractor(sourceRawImage, { pooling: "mean", normalize: true }),
    extractor(targetRawImage, { pooling: "mean", normalize: true }),
  ])

  const sourceVector = toVector(sourceFeatures)
  const targetVector = toVector(targetFeatures)
  const embedding = cosineSimilarity(sourceVector, targetVector)

  return {
    modelId,
    embeddingSimilarity: embedding,
    hybridSimilarity: hybridSimilarity(embedding, pixel, weights),
  }
}

async function compareRegions(
  sourceDataUrl: string,
  targetDataUrl: string,
  modelIds: string[],
  weights: CompareWeights
): Promise<CompareResult> {
  const ids = uniqueModelIds(modelIds)
  if (!ids.length) {
    throw new Error("Select at least one model before compare.")
  }

  const [source, target] = await Promise.all([
    decodeDataUrl(sourceDataUrl),
    decodeDataUrl(targetDataUrl),
  ])
  const normalizedWeights = normalizeWeights(weights)

  try {
    const sourceImageData = imageDataFromBitmap(source.bitmap)
    const targetImageData = imageDataFromBitmap(
      target.bitmap,
      sourceImageData.width,
      sourceImageData.height
    )

    const pixel = pixelSimilarity(sourceImageData, targetImageData)

    const perModelSettled = await Promise.allSettled(
      ids.map((modelId) =>
        compareWithModel(
          modelId,
          source.rawImage,
          target.rawImage,
          pixel,
          normalizedWeights
        )
      )
    )

    const perModelScores: PerModelScore[] = []
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

    const embeddingSimilarity = Math.min(
      ...perModelScores.map((item) => item.embeddingSimilarity)
    )
    const hybrid = Math.min(...perModelScores.map((item) => item.hybridSimilarity))

    return {
      embeddingSimilarity,
      pixelSimilarity: pixel,
      hybridSimilarity: hybrid,
      aggregation: "minimum-across-models",
      usedWeights: normalizedWeights,
      perModelScores,
    }
  } finally {
    source.bitmap.close()
    target.bitmap.close()
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  try {
    if (event.data.type === "init-model") {
      const initialized = await initModels(event.data.payload.modelIds)
      postMessageSafe({ type: "model-ready", payload: initialized })
      return
    }

    if (event.data.type === "compare") {
      const payload = event.data.payload
      if (
        !payload?.sourceDataUrl ||
        !payload?.targetDataUrl ||
        !payload?.modelIds?.length ||
        !payload?.weights
      ) {
        throw new Error("Invalid compare payload.")
      }

      const result = await compareRegions(
        payload.sourceDataUrl,
        payload.targetDataUrl,
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
