import {
  MODEL_ID_MAX_LENGTH,
  MODEL_SELECTION_MAX_MODELS,
  normalizeUniqueModelIds,
  validateModelId,
} from "@/lib/comparator/model-id"
import type { CompareImagePayload, WorkerRequest } from "@/lib/comparator/types"
import { MAX_COMPARE_SIDE } from "@/workers/embedding/constants"

export function validateCompareImagePayload(
  payload: unknown,
  label: "source" | "target"
) {
  if (!payload || typeof payload !== "object") {
    throw new Error(`Invalid compare payload: ${label} image is missing.`)
  }

  const image = payload as Partial<CompareImagePayload>
  const width = image.width
  const height = image.height
  const rgba = image.rgba

  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    typeof width !== "number" ||
    typeof height !== "number" ||
    width < 1 ||
    width > MAX_COMPARE_SIDE ||
    height < 1 ||
    height > MAX_COMPARE_SIDE
  ) {
    throw new Error(
      `Invalid compare payload: ${label} dimensions must be integers between 1 and ${MAX_COMPARE_SIDE}.`
    )
  }

  if (!(rgba instanceof Uint8ClampedArray)) {
    throw new Error(`Invalid compare payload: ${label} rgba must be Uint8ClampedArray.`)
  }

  const expectedLength = width * height * 4
  if (rgba.length !== expectedLength) {
    throw new Error(
      `Invalid compare payload: ${label} rgba length mismatch (expected ${expectedLength}).`
    )
  }
}

export function normalizeAndValidateCompareRequestPayload(
  request: Extract<WorkerRequest, { type: "compare" }>["payload"]
) {
  if (!request?.source || !request?.target || !Array.isArray(request?.modelIds) || !request?.weights) {
    throw new Error("Invalid compare payload.")
  }

  validateCompareImagePayload(request.source, "source")
  validateCompareImagePayload(request.target, "target")

  if (!request.modelIds.every((item) => typeof item === "string")) {
    throw new Error("Invalid compare payload: modelIds must be strings.")
  }

  if (request.modelIds.length > MODEL_SELECTION_MAX_MODELS) {
    throw new Error(`Select at most ${MODEL_SELECTION_MAX_MODELS} models.`)
  }

  const normalizedModelIds = normalizeUniqueModelIds(request.modelIds)
  for (const modelId of normalizedModelIds) {
    const idError = validateModelId(modelId)
    if (idError) {
      throw new Error(`Invalid model ID in compare request: ${idError}`)
    }
  }

  if (
    request.modelIds.some(
      (item) => typeof item === "string" && item.length > MODEL_ID_MAX_LENGTH
    )
  ) {
    throw new Error(`Model IDs must be ${MODEL_ID_MAX_LENGTH} characters or fewer.`)
  }

  return {
    ...request,
    modelIds: normalizedModelIds,
  }
}
