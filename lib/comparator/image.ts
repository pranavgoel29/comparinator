import { normalizedToPixelBBox } from "@/lib/comparator/bbox"
import type { NormalizedBBox } from "@/lib/comparator/types"

export const ACCEPTED_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const

export type CroppedRegion = {
  dataUrl: string
  imageData: ImageData
  width: number
  height: number
}

export function isSupportedImageFile(file: File) {
  return ACCEPTED_IMAGE_MIME_TYPES.includes(
    file.type as (typeof ACCEPTED_IMAGE_MIME_TYPES)[number]
  )
}

export async function fileToImageBitmap(file: File) {
  if (!isSupportedImageFile(file)) {
    throw new Error("Unsupported file type. Use PNG, JPEG, or WEBP.")
  }

  return createImageBitmap(file)
}

export function cropImageRegion(
  image: ImageBitmap,
  bbox: NormalizedBBox
): CroppedRegion {
  const region = normalizedToPixelBBox(bbox, {
    width: image.width,
    height: image.height,
  })

  const canvas = document.createElement("canvas")
  canvas.width = region.width
  canvas.height = region.height

  const ctx = canvas.getContext("2d")
  if (!ctx) {
    throw new Error("Could not initialize canvas context.")
  }

  ctx.drawImage(
    image,
    region.x,
    region.y,
    region.width,
    region.height,
    0,
    0,
    region.width,
    region.height
  )

  const imageData = ctx.getImageData(0, 0, region.width, region.height)
  const dataUrl = canvas.toDataURL("image/png")

  return {
    dataUrl,
    imageData,
    width: region.width,
    height: region.height,
  }
}

export function resizeCroppedRegion(
  region: CroppedRegion,
  maxSide: number
): CroppedRegion {
  const sideLimit = Math.max(16, Math.round(maxSide))
  const largestSide = Math.max(region.width, region.height)
  if (largestSide <= sideLimit) {
    return region
  }

  const scale = sideLimit / largestSide
  const nextWidth = Math.max(1, Math.round(region.width * scale))
  const nextHeight = Math.max(1, Math.round(region.height * scale))

  const sourceCanvas = document.createElement("canvas")
  sourceCanvas.width = region.width
  sourceCanvas.height = region.height
  const sourceCtx = sourceCanvas.getContext("2d")
  if (!sourceCtx) {
    throw new Error("Could not initialize source resize canvas context.")
  }
  sourceCtx.putImageData(region.imageData, 0, 0)

  const targetCanvas = document.createElement("canvas")
  targetCanvas.width = nextWidth
  targetCanvas.height = nextHeight
  const targetCtx = targetCanvas.getContext("2d")
  if (!targetCtx) {
    throw new Error("Could not initialize target resize canvas context.")
  }

  targetCtx.imageSmoothingEnabled = true
  targetCtx.imageSmoothingQuality = "high"
  targetCtx.drawImage(sourceCanvas, 0, 0, nextWidth, nextHeight)

  return {
    dataUrl: targetCanvas.toDataURL("image/png"),
    imageData: targetCtx.getImageData(0, 0, nextWidth, nextHeight),
    width: nextWidth,
    height: nextHeight,
  }
}

export function calculateViewportSize(
  image: { width: number; height: number },
  containerWidth: number,
  limits = { maxWidth: 760, maxHeight: 520 }
) {
  const effectiveWidth = Math.max(1, Math.min(containerWidth || image.width, limits.maxWidth))
  const ratio = image.width / image.height

  let width = effectiveWidth
  let height = width / ratio

  if (height > limits.maxHeight) {
    height = limits.maxHeight
    width = height * ratio
  }

  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  }
}
