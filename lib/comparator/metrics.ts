import { MODEL_CONFIG } from "@/lib/comparator/model-config"

const DEFAULT_EMBEDDING_WEIGHT = MODEL_CONFIG.hybridWeights.embedding
const DEFAULT_PIXEL_WEIGHT = MODEL_CONFIG.hybridWeights.pixel

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

  const cosine = dot / denom
  return clamp01(cosine)
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

function grayscaleAt(data: Uint8ClampedArray, offset: number) {
  return (
    0.299 * data[offset] +
    0.587 * data[offset + 1] +
    0.114 * data[offset + 2]
  )
}

function edgeSimilarity(a: ImageData, b: ImageData) {
  const width = a.width
  const height = a.height

  let sumDiff = 0
  let count = 0

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idxL = (y * width + (x - 1)) * 4
      const idxR = (y * width + (x + 1)) * 4
      const idxU = ((y - 1) * width + x) * 4
      const idxD = ((y + 1) * width + x) * 4

      const ax = grayscaleAt(a.data, idxR) - grayscaleAt(a.data, idxL)
      const ay = grayscaleAt(a.data, idxD) - grayscaleAt(a.data, idxU)
      const bx = grayscaleAt(b.data, idxR) - grayscaleAt(b.data, idxL)
      const by = grayscaleAt(b.data, idxD) - grayscaleAt(b.data, idxU)

      const aMag = Math.hypot(ax, ay)
      const bMag = Math.hypot(bx, by)

      sumDiff += Math.abs(aMag - bMag)
      count += 1
    }
  }

  if (!count) {
    return 0
  }

  const normalizedMae = sumDiff / (count * 255 * 1.5)
  return clamp01(1 - normalizedMae)
}

function localPatchSimilarity(a: ImageData, b: ImageData, patchGrid = 4) {
  const patchScores: number[] = []
  const patchWidth = Math.max(1, Math.floor(a.width / patchGrid))
  const patchHeight = Math.max(1, Math.floor(a.height / patchGrid))

  for (let py = 0; py < patchGrid; py += 1) {
    for (let px = 0; px < patchGrid; px += 1) {
      const startX = px * patchWidth
      const startY = py * patchHeight
      const endX = px === patchGrid - 1 ? a.width : startX + patchWidth
      const endY = py === patchGrid - 1 ? a.height : startY + patchHeight

      let patchSum = 0
      let pixels = 0

      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          const idx = (y * a.width + x) * 4
          patchSum += Math.abs(a.data[idx] - b.data[idx])
          patchSum += Math.abs(a.data[idx + 1] - b.data[idx + 1])
          patchSum += Math.abs(a.data[idx + 2] - b.data[idx + 2])
          pixels += 1
        }
      }

      if (!pixels) {
        continue
      }

      const mae = patchSum / (pixels * 255 * 3)
      patchScores.push(clamp01(1 - mae))
    }
  }

  if (!patchScores.length) {
    return 0
  }

  const sorted = [...patchScores].sort((x, y) => x - y)
  const worstCount = Math.max(1, Math.floor(sorted.length * 0.25))
  const worstAvg =
    sorted.slice(0, worstCount).reduce((acc, value) => acc + value, 0) /
    worstCount

  return clamp01(worstAvg)
}

function changedPixelSimilarity(a: ImageData, b: ImageData, threshold = 18) {
  let changed = 0
  const total = a.width * a.height

  for (let i = 0; i < a.data.length; i += 4) {
    const diff =
      (Math.abs(a.data[i] - b.data[i]) +
        Math.abs(a.data[i + 1] - b.data[i + 1]) +
        Math.abs(a.data[i + 2] - b.data[i + 2])) /
      3

    if (diff > threshold) {
      changed += 1
    }
  }

  return clamp01(1 - changed / total)
}

export function pixelSimilarity(source: ImageData, target: ImageData) {
  const resizedTarget =
    source.width === target.width && source.height === target.height
      ? target
      : resizeImageData(target, source.width, source.height)

  const maeSimilarity = clamp01(1 - meanAbsoluteErrorNormalized(source, resizedTarget))
  const edge = edgeSimilarity(source, resizedTarget)
  const local = localPatchSimilarity(source, resizedTarget)
  const changed = changedPixelSimilarity(source, resizedTarget)

  return clamp01(
    maeSimilarity * 0.25 + edge * 0.3 + local * 0.35 + changed * 0.1
  )
}

export function hybridSimilarity(
  embedding: number,
  pixel: number,
  weights?: { embedding?: number; pixel?: number }
) {
  const embeddingWeight = weights?.embedding ?? DEFAULT_EMBEDDING_WEIGHT
  const pixelWeight = weights?.pixel ?? DEFAULT_PIXEL_WEIGHT
  const embeddingScore = clamp01(embedding)
  const pixelScore = clamp01(pixel)

  if (embeddingWeight <= 0 && pixelWeight > 0) {
    return pixelScore
  }

  if (pixelWeight <= 0 && embeddingWeight > 0) {
    return embeddingScore
  }

  const totalWeight = embeddingWeight + pixelWeight
  if (!totalWeight) {
    return 0
  }

  return clamp01(
    (embeddingScore * embeddingWeight + pixelScore * pixelWeight) / totalWeight
  )
}

export function isPass(score: number, threshold: number) {
  return clamp01(score) >= clamp01(threshold)
}
