/// <reference lib="webworker" />

import { RawImage, env, pipeline } from "@huggingface/transformers"

import { cosineSimilarity, hybridSimilarity, pixelSimilarity } from "@/lib/comparator/metrics"
import type {
  CompareResult,
  WorkerRequest,
  WorkerResponse,
} from "@/lib/comparator/types"

const MODEL_ID = "Xenova/clip-vit-base-patch32"

env.allowLocalModels = false

type FeatureExtractor = (
  input: unknown,
  options?: Record<string, unknown>
) => Promise<unknown>

let extractorPromise: Promise<FeatureExtractor> | null = null

function postMessageSafe(message: WorkerResponse) {
  self.postMessage(message)
}

async function getExtractor() {
  if (!extractorPromise) {
    const createPipeline = pipeline as unknown as (
      task: string,
      model: string,
      options: Record<string, unknown>
    ) => Promise<FeatureExtractor>

    extractorPromise = createPipeline("image-feature-extraction", MODEL_ID, {
      quantized: true,
    })
  }

  return extractorPromise
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

async function compareRegions(
  sourceDataUrl: string,
  targetDataUrl: string
): Promise<CompareResult> {
  const extractor = await getExtractor()

  const [source, target] = await Promise.all([
    decodeDataUrl(sourceDataUrl),
    decodeDataUrl(targetDataUrl),
  ])

  try {
    const [sourceFeatures, targetFeatures] = await Promise.all([
      extractor(source.rawImage, { pooling: "mean", normalize: true }),
      extractor(target.rawImage, { pooling: "mean", normalize: true }),
    ])

    const sourceVector = toVector(sourceFeatures)
    const targetVector = toVector(targetFeatures)
    const embeddingSimilarity = cosineSimilarity(sourceVector, targetVector)

    const sourceImageData = imageDataFromBitmap(source.bitmap)
    const targetImageData = imageDataFromBitmap(
      target.bitmap,
      sourceImageData.width,
      sourceImageData.height
    )

    const pixel = pixelSimilarity(sourceImageData, targetImageData)
    const hybrid = hybridSimilarity(embeddingSimilarity, pixel)

    return {
      embeddingSimilarity,
      pixelSimilarity: pixel,
      hybridSimilarity: hybrid,
    }
  } finally {
    source.bitmap.close()
    target.bitmap.close()
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  try {
    if (event.data.type === "init-model") {
      await getExtractor()
      postMessageSafe({ type: "model-ready" })
      return
    }

    if (event.data.type === "compare") {
      const payload = event.data.payload
      if (!payload?.sourceDataUrl || !payload?.targetDataUrl) {
        throw new Error("Invalid compare payload.")
      }

      const result = await compareRegions(
        payload.sourceDataUrl,
        payload.targetDataUrl
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
