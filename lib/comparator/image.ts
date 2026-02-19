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
