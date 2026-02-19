import { MODEL_CONFIG } from "@/lib/comparator/model-config"
import {
  MODEL_SELECTION_MAX_MODELS,
  normalizeUniqueModelIds,
  validateModelId,
} from "@/lib/comparator/model-id"
import type { ModelDownloadProgress } from "@/lib/comparator/types"
import { fetchModelSizeBytes } from "@/workers/embedding/metadata"
import {
  createModelStatus,
  normalizeWorkerError,
  postModelProgress,
  postModelStatus,
  progressFromEvent,
} from "@/workers/embedding/progress"
import {
  createPipeline,
  extractorPromises,
  knownModelSizes,
  type FeatureExtractor,
} from "@/workers/embedding/runtime"

export async function getExtractor(modelId: string) {
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

async function getExtractorWithProgress(
  modelId: string,
  onProgress: (progress: ModelDownloadProgress) => void
): Promise<FeatureExtractor> {
  const existing = extractorPromises.get(modelId)
  if (existing) {
    return existing
  }

  const promise = createPipeline(MODEL_CONFIG.task, modelId, {
    quantized: MODEL_CONFIG.quantized,
    progress_callback: (event: unknown) => {
      const progress = progressFromEvent(modelId, event)
      if (progress) {
        onProgress(progress)
      }
    },
  })

  extractorPromises.set(modelId, promise)
  return promise
}

export async function initModels(modelIds: string[]) {
  const ids = normalizeUniqueModelIds(modelIds)
  if (!ids.length) {
    throw new Error("Select at least one model.")
  }
  if (ids.length > MODEL_SELECTION_MAX_MODELS) {
    throw new Error(`Select at most ${MODEL_SELECTION_MAX_MODELS} models.`)
  }

  const loadedModelIds: string[] = []
  const failedModels: Array<{ modelId: string; error: string }> = []
  const modelStatuses: ReturnType<typeof createModelStatus>[] = []

  for (const modelId of ids) {
    const validationError = validateModelId(modelId)
    if (validationError) {
      const status = createModelStatus(modelId, "error", { error: validationError })
      failedModels.push({ modelId, error: validationError })
      modelStatuses.push(status)
      postModelStatus(status)
      continue
    }

    const knownSize = knownModelSizes.get(modelId)
    let sizeBytes: number | null = knownSize?.sizeBytes ?? null
    let sizeSource = knownSize?.sizeSource ?? "unknown"
    let metadataError: string | null = null
    let downloadedTotalBytes = 0

    const metadataLoading = createModelStatus(modelId, "metadata-loading")
    modelStatuses.push(metadataLoading)
    postModelStatus(metadataLoading)

    try {
      const nextSize = await fetchModelSizeBytes(modelId)
      if (typeof nextSize === "number") {
        sizeBytes = nextSize
        sizeSource = "huggingface-api"
      }
    } catch (error) {
      metadataError = normalizeWorkerError(error, "Metadata fetch failed.")
    }

    const initializing = createModelStatus(modelId, "initializing", {
      sizeBytes,
      sizeSource,
      error: metadataError,
    })
    modelStatuses.push(initializing)
    postModelStatus(initializing)

    try {
      await getExtractorWithProgress(modelId, (progress) => {
        postModelProgress(progress)
        if (
          typeof progress.total === "number" &&
          progress.total > downloadedTotalBytes
        ) {
          downloadedTotalBytes = progress.total
        }
      })

      loadedModelIds.push(modelId)
      if (!sizeBytes && downloadedTotalBytes > 0) {
        sizeBytes = Math.round(downloadedTotalBytes)
        sizeSource = "unknown"
      }
      if (typeof sizeBytes === "number" && sizeBytes > 0) {
        knownModelSizes.set(modelId, { sizeBytes, sizeSource })
      }

      const readyStatus = createModelStatus(modelId, "ready", {
        sizeBytes,
        sizeSource,
        error: metadataError,
      })
      modelStatuses.push(readyStatus)
      postModelStatus(readyStatus)
    } catch (error) {
      const reason = normalizeWorkerError(error, "Failed to initialize model.")
      failedModels.push({ modelId, error: reason })
      extractorPromises.delete(modelId)
      const errorStatus = createModelStatus(modelId, "error", {
        sizeBytes,
        sizeSource,
        error: metadataError ? `${reason} | ${metadataError}` : reason,
      })
      modelStatuses.push(errorStatus)
      postModelStatus(errorStatus)
    }
  }

  return { loadedModelIds, failedModels, modelStatuses }
}
