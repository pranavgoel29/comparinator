"use client"

import * as React from "react"

import { MODEL_SELECTION_MAX_MODELS } from "@/lib/comparator/model-id"
import { modelLabelFromId } from "@/lib/comparator/model-config"
import { normalizeUniqueModelIds, validateModelId, validateModelSelectionCount } from "@/lib/comparator/model-id"
import type { CompareRequest, CompareResult, ModelDownloadProgress, ModelRuntimeStatus, WorkerRequest, WorkerResponse } from "@/lib/comparator/types"
import type { BenchmarkPoolHandle } from "@/lib/comparator/benchmark-pool"
import { clearBenchmarkPoolCache } from "@/lib/comparator/benchmark-pool"
import type { ModelStatus } from "@/components/comparator/comparator-types"

function createComparatorWorker() {
  return new Worker(new URL("../../workers/embedding.worker.ts", import.meta.url), { type: "module" })
}

function unique(ids: string[]) {
  return normalizeUniqueModelIds(ids)
}

type UseComparatorWorkerArgs = {
  setIsComparing: (value: boolean) => void
  setRuntimeInfo: (value: string | null) => void
}

export function useComparatorWorker({ setIsComparing, setRuntimeInfo }: UseComparatorWorkerArgs) {
  const [modelStatus, setModelStatus] = React.useState<ModelStatus>("idle")
  const [modelError, setModelError] = React.useState<string | null>(null)
  const [loadedModelIds, setLoadedModelIds] = React.useState<string[]>([])
  const [failedModelMessages, setFailedModelMessages] = React.useState<string[]>([])
  const [modelRuntimeStatuses, setModelRuntimeStatuses] = React.useState<Record<string, ModelRuntimeStatus>>({})
  const [modelDownloadProgress, setModelDownloadProgress] = React.useState<Record<string, ModelDownloadProgress>>({})
  const [workerMounted, setWorkerMounted] = React.useState(false)

  const workerRef = React.useRef<Worker | null>(null)
  const pendingCompareRef = React.useRef<{
    resolve: (value: CompareResult) => void
    reject: (error: Error) => void
  } | null>(null)

  const initWorkerModels = React.useCallback((modelIds: string[]) => {
    if (!workerRef.current) {
      return
    }
    const nextModelIds = unique(modelIds)
    if (!validateModelSelectionCount(nextModelIds)) {
      setModelError(`Select at most ${MODEL_SELECTION_MAX_MODELS} models.`)
      return
    }
    const invalidModel = nextModelIds.find((modelId) => Boolean(validateModelId(modelId)))
    if (invalidModel) {
      setModelError(validateModelId(invalidModel) ?? "Invalid model id")
      return
    }

    setModelStatus("loading")
    setModelError(null)
    setFailedModelMessages([])
    setModelDownloadProgress((previous) => {
      const next = { ...previous }
      for (const modelId of nextModelIds) {
        next[modelId] = {
          modelId,
          status: "initiate",
          file: null,
          progress: 0,
          loaded: null,
          total: null,
          updatedAt: Date.now(),
        }
      }
      return next
    })
    setModelRuntimeStatuses((previous) => {
      const now = Date.now()
      const next = { ...previous }
      for (const modelId of nextModelIds) {
        const current = next[modelId]
        next[modelId] = {
          modelId,
          phase: "metadata-loading",
          sizeBytes: current?.sizeBytes ?? null,
          sizeSource: current?.sizeSource ?? "unknown",
          error: null,
          updatedAt: now,
        }
      }
      return next
    })

    workerRef.current.postMessage({ type: "init-model", payload: { modelIds: nextModelIds } } satisfies WorkerRequest)
  }, [])

  const executeCompare = React.useCallback((payload: CompareRequest) => {
    if (!workerRef.current) {
      return Promise.reject(new Error("Worker is not ready yet."))
    }
    if (pendingCompareRef.current) {
      return Promise.reject(new Error("A comparison is already in progress."))
    }

    return new Promise<CompareResult>((resolve, reject) => {
      pendingCompareRef.current = { resolve, reject }
      const transferList: Transferable[] = []
      if (payload.source.rgba.buffer instanceof ArrayBuffer) {
        transferList.push(payload.source.rgba.buffer)
      }
      if (payload.target.rgba.buffer instanceof ArrayBuffer) {
        transferList.push(payload.target.rgba.buffer)
      }

      workerRef.current?.postMessage({ type: "compare", payload } satisfies WorkerRequest, transferList)
    })
  }, [])

  const clearRuntimeCache = React.useCallback(async (benchmarkPool: BenchmarkPoolHandle | null) => {
    if (!workerRef.current) {
      setModelError("Worker is not ready yet.")
      return
    }
    workerRef.current.postMessage({ type: "clear-cache" } satisfies WorkerRequest)
    try {
      await clearBenchmarkPoolCache(benchmarkPool)
      setRuntimeInfo("Runtime cache cleared for live and benchmark workers.")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to clear benchmark cache."
      setModelError(message)
    }
  }, [setRuntimeInfo])

  React.useEffect(() => {
    const worker = createComparatorWorker()
    workerRef.current = worker
    setWorkerMounted(true)

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data
      if (message.type === "model-progress") {
        setModelDownloadProgress((previous) => ({ ...previous, [message.payload.modelId]: message.payload }))
        return
      }
      if (message.type === "model-status") {
        setModelRuntimeStatuses((previous) => {
          const current = previous[message.payload.modelId]
          const keepSize = current && typeof current.sizeBytes === "number" && message.payload.sizeBytes === null
          const keepSource = keepSize ? current.sizeSource : message.payload.sizeSource
          return {
            ...previous,
            [message.payload.modelId]: {
              ...message.payload,
              sizeBytes: keepSize ? current.sizeBytes : message.payload.sizeBytes,
              sizeSource: keepSource,
            },
          }
        })
        return
      }
      if (message.type === "model-ready") {
        setLoadedModelIds(message.payload.loadedModelIds)
        setModelRuntimeStatuses((previous) => {
          const next = { ...previous }
          for (const status of message.payload.modelStatuses) {
            const current = next[status.modelId]
            const keepSize = current && typeof current.sizeBytes === "number" && status.sizeBytes === null
            const keepSource = keepSize ? current.sizeSource : status.sizeSource
            next[status.modelId] = {
              ...status,
              sizeBytes: keepSize ? current.sizeBytes : status.sizeBytes,
              sizeSource: keepSource,
            }
          }
          return next
        })
        setFailedModelMessages(message.payload.failedModels.map((item) => `${modelLabelFromId(item.modelId)}: ${item.error}`))
        setModelStatus(message.payload.loadedModelIds.length ? "ready" : "error")
        setModelError(message.payload.loadedModelIds.length ? null : "None of the selected models initialized successfully.")
        return
      }
      if (message.type === "compare-result") {
        if (pendingCompareRef.current) {
          pendingCompareRef.current.resolve(message.payload)
          pendingCompareRef.current = null
          return
        }
        return
      }
      if (message.type === "cache-cleared") {
        setRuntimeInfo("Runtime cache cleared. Next compare will recompute everything.")
        return
      }
      if (message.type === "error") {
        if (pendingCompareRef.current) {
          pendingCompareRef.current.reject(new Error(message.message))
          pendingCompareRef.current = null
        }
        setModelStatus((prev) => (prev === "loading" ? "error" : prev))
        setModelError(message.message)
        setIsComparing(false)
      }
    }

    worker.onerror = (event) => {
      const error = new Error(event.message || "Worker crashed unexpectedly.")
      if (pendingCompareRef.current) {
        pendingCompareRef.current.reject(error)
        pendingCompareRef.current = null
      }
      setModelStatus("error")
      setModelError(error.message)
      setIsComparing(false)
    }

    return () => {
      if (pendingCompareRef.current) {
        pendingCompareRef.current.reject(new Error("Worker terminated."))
        pendingCompareRef.current = null
      }
      worker.terminate()
      workerRef.current = null
      setWorkerMounted(false)
    }
  }, [setIsComparing, setRuntimeInfo])

  return {
    workerMounted,
    createWorker: createComparatorWorker,
    modelStatus,
    modelError,
    setModelError,
    loadedModelIds,
    failedModelMessages,
    modelRuntimeStatuses,
    modelDownloadProgress,
    initWorkerModels,
    executeCompare,
    clearRuntimeCache,
  }
}
