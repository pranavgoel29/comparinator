import type { WorkerRequest } from "@/lib/comparator/types"
import { compareRegions } from "@/workers/embedding/compare"
import { initModels } from "@/workers/embedding/model-init"
import { embeddingCache, pixelCache, postMessageSafe } from "@/workers/embedding/runtime"
import { normalizeAndValidateCompareRequestPayload } from "@/workers/embedding/validate"

export function createWorkerMessageHandler() {
  return async (event: MessageEvent<WorkerRequest>) => {
    try {
      if (event.data.type === "init-model") {
        const initialized = await initModels(event.data.payload.modelIds)
        postMessageSafe({ type: "model-ready", payload: initialized })
        return
      }

      if (event.data.type === "clear-cache") {
        embeddingCache.clear()
        pixelCache.clear()
        postMessageSafe({ type: "cache-cleared" })
        return
      }

      if (event.data.type === "compare") {
        const payload = normalizeAndValidateCompareRequestPayload(event.data.payload)
        const result = await compareRegions(
          payload.source,
          payload.target,
          payload.modelIds,
          payload.weights
        )
        postMessageSafe({ type: "compare-result", payload: result })
        return
      }

      throw new Error("Unsupported worker message type.")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown worker error"
      postMessageSafe({ type: "error", message })
    }
  }
}
