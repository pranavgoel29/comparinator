import type { NormalizedBBox, PixelBBox } from "@/lib/comparator/types"

const MIN_NORMALIZED_SIZE = 0.0001

export type MinMaxBBox = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function createDefaultBBox(): NormalizedBBox {
  return { x: 0.2, y: 0.2, width: 0.6, height: 0.6 }
}

export function clampNormalizedBBox(bbox: NormalizedBBox): NormalizedBBox {
  const width = clamp(bbox.width, MIN_NORMALIZED_SIZE, 1)
  const height = clamp(bbox.height, MIN_NORMALIZED_SIZE, 1)
  const x = clamp(bbox.x, 0, 1 - width)
  const y = clamp(bbox.y, 0, 1 - height)

  return { x, y, width, height }
}

export function enforceMinimumBoxSize(
  bbox: NormalizedBBox,
  dimensions: { width: number; height: number },
  minPixels = 8
): NormalizedBBox {
  const minWidth = clamp(minPixels / dimensions.width, MIN_NORMALIZED_SIZE, 1)
  const minHeight = clamp(minPixels / dimensions.height, MIN_NORMALIZED_SIZE, 1)

  const next = {
    ...bbox,
    width: Math.max(bbox.width, minWidth),
    height: Math.max(bbox.height, minHeight),
  }

  return clampNormalizedBBox(next)
}

export function normalizedToPixelBBox(
  bbox: NormalizedBBox,
  dimensions: { width: number; height: number }
): PixelBBox {
  const clamped = clampNormalizedBBox(bbox)
  const x = Math.round(clamped.x * dimensions.width)
  const y = Math.round(clamped.y * dimensions.height)
  const width = Math.max(1, Math.round(clamped.width * dimensions.width))
  const height = Math.max(1, Math.round(clamped.height * dimensions.height))

  return clampPixelBBox(
    { x, y, width, height },
    dimensions.width,
    dimensions.height,
    1,
    1
  )
}

export function pixelToNormalizedBBox(
  bbox: PixelBBox,
  dimensions: { width: number; height: number }
): NormalizedBBox {
  const normalized = {
    x: bbox.x / dimensions.width,
    y: bbox.y / dimensions.height,
    width: bbox.width / dimensions.width,
    height: bbox.height / dimensions.height,
  }

  return clampNormalizedBBox(normalized)
}

export function clampPixelBBox(
  bbox: PixelBBox,
  maxWidth: number,
  maxHeight: number,
  minWidth = 1,
  minHeight = 1
): PixelBBox {
  const width = clamp(bbox.width, minWidth, maxWidth)
  const height = clamp(bbox.height, minHeight, maxHeight)
  const x = clamp(bbox.x, 0, maxWidth - width)
  const y = clamp(bbox.y, 0, maxHeight - height)

  return { x, y, width, height }
}

export function isBBoxAtLeastMinPixels(
  bbox: NormalizedBBox,
  dimensions: { width: number; height: number },
  minPixels = 8
) {
  const pixel = normalizedToPixelBBox(bbox, dimensions)
  return pixel.width >= minPixels && pixel.height >= minPixels
}

export function roundNormalizedBBox(
  bbox: NormalizedBBox,
  precision = 5
): NormalizedBBox {
  const factor = 10 ** precision
  return {
    x: Math.round(bbox.x * factor) / factor,
    y: Math.round(bbox.y * factor) / factor,
    width: Math.round(bbox.width * factor) / factor,
    height: Math.round(bbox.height * factor) / factor,
  }
}

export function normalizedToMinMaxBBox(
  bbox: NormalizedBBox,
  dimensions: { width: number; height: number }
): MinMaxBBox {
  const pixel = normalizedToPixelBBox(bbox, dimensions)

  return {
    minX: pixel.x,
    minY: pixel.y,
    maxX: pixel.x + pixel.width,
    maxY: pixel.y + pixel.height,
  }
}

export function minMaxBBoxToNormalized(
  bbox: MinMaxBBox,
  dimensions: { width: number; height: number }
): NormalizedBBox {
  const values = [bbox.minX, bbox.minY, bbox.maxX, bbox.maxY]
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error("BBox JSON must contain finite min/max numeric values.")
  }

  const minX = clamp(Math.min(bbox.minX, bbox.maxX), 0, dimensions.width - 1)
  const maxX = clamp(Math.max(bbox.minX, bbox.maxX), 1, dimensions.width)
  const minY = clamp(Math.min(bbox.minY, bbox.maxY), 0, dimensions.height - 1)
  const maxY = clamp(Math.max(bbox.minY, bbox.maxY), 1, dimensions.height)

  const width = maxX - minX
  const height = maxY - minY

  if (width <= 0 || height <= 0) {
    throw new Error("BBox JSON must define a positive width and height.")
  }

  return pixelToNormalizedBBox(
    {
      x: Math.round(minX),
      y: Math.round(minY),
      width: Math.round(width),
      height: Math.round(height),
    },
    dimensions
  )
}
