const DEFAULT_EMBEDDING_WEIGHT = 0.8
const DEFAULT_PIXEL_WEIGHT = 0.2

function clamp01(value: number) {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return 0
  }
  return Math.max(0, Math.min(1, value))
}

export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>) {
  if (a.length !== b.length || a.length === 0) {
    return 0
  }

  let dot = 0
  let aNorm = 0
  let bNorm = 0

  for (let i = 0; i < a.length; i += 1) {
    const av = a[i]
    const bv = b[i]

    dot += av * bv
    aNorm += av * av
    bNorm += bv * bv
  }

  const denom = Math.sqrt(aNorm) * Math.sqrt(bNorm)
  if (!denom) {
    return 0
  }

  return clamp01((dot / denom + 1) / 2)
}

function create2dCanvas(width: number, height: number) {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      throw new Error("Unable to create OffscreenCanvas context.")
    }
    return { canvas, ctx }
  }

  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext("2d")
    if (!ctx) {
      throw new Error("Unable to create canvas context.")
    }

    return { canvas, ctx }
  }

  throw new Error("No canvas implementation available in this runtime.")
}

function resizeImageData(imageData: ImageData, width: number, height: number) {
  const source = create2dCanvas(imageData.width, imageData.height)
  source.ctx.putImageData(imageData, 0, 0)

  const target = create2dCanvas(width, height)
  target.ctx.drawImage(
    source.canvas as unknown as CanvasImageSource,
    0,
    0,
    width,
    height
  )

  return target.ctx.getImageData(0, 0, width, height)
}

function meanAbsoluteErrorNormalized(a: ImageData, b: ImageData) {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error("ImageData dimensions must match to compute MAE.")
  }

  const channels = 3
  const total = a.width * a.height * channels
  let sum = 0

  for (let i = 0; i < a.data.length; i += 4) {
    sum += Math.abs(a.data[i] - b.data[i])
    sum += Math.abs(a.data[i + 1] - b.data[i + 1])
    sum += Math.abs(a.data[i + 2] - b.data[i + 2])
  }

  return sum / (total * 255)
}

export function pixelSimilarity(source: ImageData, target: ImageData) {
  const resizedTarget =
    source.width === target.width && source.height === target.height
      ? target
      : resizeImageData(target, source.width, source.height)

  const mae = meanAbsoluteErrorNormalized(source, resizedTarget)
  return clamp01(1 - mae)
}

export function hybridSimilarity(
  embedding: number,
  pixel: number,
  weights?: { embedding?: number; pixel?: number }
) {
  const embeddingWeight = weights?.embedding ?? DEFAULT_EMBEDDING_WEIGHT
  const pixelWeight = weights?.pixel ?? DEFAULT_PIXEL_WEIGHT

  const totalWeight = embeddingWeight + pixelWeight
  if (!totalWeight) {
    return 0
  }

  const score =
    (clamp01(embedding) * embeddingWeight + clamp01(pixel) * pixelWeight) /
    totalWeight

  return clamp01(score)
}

export function isPass(score: number, threshold: number) {
  return clamp01(score) >= clamp01(threshold)
}
