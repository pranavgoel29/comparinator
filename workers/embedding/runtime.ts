import { env, pipeline } from "@huggingface/transformers"
import type { ModelRuntimeStatus, WorkerResponse } from "@/lib/comparator/types"

env.allowLocalModels = false

export type FeatureExtractor = (
  input: unknown,
  options?: Record<string, unknown>
) => Promise<unknown>

export const extractorPromises = new Map<string, Promise<FeatureExtractor>>()
export const embeddingCache = new Map<string, number[]>()
export const pixelCache = new Map<string, number>()
export const knownModelSizes = new Map<
  string,
  { sizeBytes: number; sizeSource: ModelRuntimeStatus["sizeSource"] }
>()

export const createPipeline = pipeline as unknown as (
  task: string,
  model: string,
  options: Record<string, unknown>
) => Promise<FeatureExtractor>

export function postMessageSafe(message: WorkerResponse) {
  self.postMessage(message)
}
