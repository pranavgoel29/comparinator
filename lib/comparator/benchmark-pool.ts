import type {
  CompareRequest,
  CompareResult,
  ModelInitResult,
  WorkerRequest,
  WorkerResponse,
} from "@/lib/comparator/types"

export type BenchmarkTask = {
  id: string
  request: CompareRequest
}

export type BenchmarkPoolCallbacks = {
  onTaskStart?: (taskId: string) => void
  onTaskComplete?: (
    taskId: string,
    result: CompareResult,
    durationMs: number
  ) => void
  onTaskError?: (taskId: string, error: string, durationMs: number) => void
}

type BenchmarkPoolWorker = {
  worker: Worker
  initializedFor: string | null
}

export type BenchmarkPoolHandle = {
  workers: BenchmarkPoolWorker[]
  signature: string
}

export type EnsureBenchmarkPoolOptions = {
  existingPool: BenchmarkPoolHandle | null
  modelIds: string[]
  needsEmbedding: boolean
  poolSize: number
  createWorker: () => Worker
  signal?: AbortSignal
}

export type RunBenchmarkPoolOptions = {
  tasks: BenchmarkTask[]
  pool: BenchmarkPoolHandle
  callbacks?: BenchmarkPoolCallbacks
  signal?: AbortSignal
}

function getDeviceMemory() {
  if (typeof navigator === "undefined") {
    return undefined
  }

  return (navigator as Navigator & { deviceMemory?: number }).deviceMemory
}

function createAbortError() {
  return new DOMException("Benchmark run aborted.", "AbortError")
}

function ensureNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw createAbortError()
  }
}

function normalizeModelIds(modelIds: string[]) {
  return Array.from(new Set(modelIds.map((value) => value.trim()).filter(Boolean)))
}

function buildSignature(modelIds: string[], needsEmbedding: boolean) {
  if (!needsEmbedding) {
    return "pixel-only"
  }

  return `embedding:${normalizeModelIds(modelIds).sort().join("|")}`
}

function createPoolWorker(createWorker: () => Worker): BenchmarkPoolWorker {
  return { worker: createWorker(), initializedFor: null }
}

export function getAdaptiveBenchmarkPoolSize(taskCount: number) {
  if (!taskCount) {
    return 1
  }

  const cores =
    typeof navigator !== "undefined" && navigator.hardwareConcurrency
      ? navigator.hardwareConcurrency
      : 2
  const memory = getDeviceMemory()

  let targetSize = 2

  if (cores <= 4 || (typeof memory === "number" && memory <= 4)) {
    targetSize = 1
  } else if (cores >= 8 && (typeof memory !== "number" || memory >= 8)) {
    targetSize = 3
  }

  return Math.max(1, Math.min(3, targetSize, taskCount))
}

export function disposeBenchmarkPool(pool: BenchmarkPoolHandle | null) {
  if (!pool) {
    return
  }

  for (const state of pool.workers) {
    state.worker.terminate()
  }
}

async function waitForWorkerMessage<T extends WorkerResponse["type"]>(
  worker: Worker,
  request: WorkerRequest,
  expectedType: T,
  signal?: AbortSignal
): Promise<Extract<WorkerResponse, { type: T }>> {
  ensureNotAborted(signal)

  return new Promise<Extract<WorkerResponse, { type: T }>>((resolve, reject) => {
    let done = false

    const cleanup = () => {
      worker.removeEventListener("message", handleMessage)
      worker.removeEventListener("error", handleError)
      signal?.removeEventListener("abort", handleAbort)
    }

    const resolveOnce = (value: Extract<WorkerResponse, { type: T }>) => {
      if (done) {
        return
      }
      done = true
      cleanup()
      resolve(value)
    }

    const rejectOnce = (error: Error) => {
      if (done) {
        return
      }
      done = true
      cleanup()
      reject(error)
    }

    const handleMessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data
      if (message.type === expectedType) {
        resolveOnce(message as Extract<WorkerResponse, { type: T }>)
        return
      }

      if (message.type === "error") {
        rejectOnce(new Error(message.message))
      }
    }

    const handleError = (event: ErrorEvent) => {
      rejectOnce(new Error(event.message || "Worker crashed unexpectedly."))
    }

    const handleAbort = () => {
      rejectOnce(createAbortError())
    }

    worker.addEventListener("message", handleMessage)
    worker.addEventListener("error", handleError)
    signal?.addEventListener("abort", handleAbort)
    worker.postMessage(request)
  })
}

async function initWorkerForBenchmark(
  worker: Worker,
  modelIds: string[],
  signal?: AbortSignal
): Promise<ModelInitResult> {
  const response = await waitForWorkerMessage(
    worker,
    { type: "init-model", payload: { modelIds } },
    "model-ready",
    signal
  )

  return response.payload
}

async function compareWithWorker(
  worker: Worker,
  request: CompareRequest,
  signal?: AbortSignal
): Promise<CompareResult> {
  const sourceRgba = new Uint8ClampedArray(request.source.rgba)
  const targetRgba = new Uint8ClampedArray(request.target.rgba)
  const transferList: Transferable[] = []
  if (sourceRgba.buffer instanceof ArrayBuffer) {
    transferList.push(sourceRgba.buffer)
  }
  if (targetRgba.buffer instanceof ArrayBuffer) {
    transferList.push(targetRgba.buffer)
  }

  ensureNotAborted(signal)

  return new Promise<CompareResult>((resolve, reject) => {
    let done = false

    const cleanup = () => {
      worker.removeEventListener("message", handleMessage)
      worker.removeEventListener("error", handleError)
      signal?.removeEventListener("abort", handleAbort)
    }

    const resolveOnce = (value: CompareResult) => {
      if (done) {
        return
      }
      done = true
      cleanup()
      resolve(value)
    }

    const rejectOnce = (error: Error) => {
      if (done) {
        return
      }
      done = true
      cleanup()
      reject(error)
    }

    const handleMessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data
      if (message.type === "compare-result") {
        resolveOnce(message.payload)
        return
      }

      if (message.type === "error") {
        rejectOnce(new Error(message.message))
      }
    }

    const handleError = (event: ErrorEvent) => {
      rejectOnce(new Error(event.message || "Worker crashed unexpectedly."))
    }

    const handleAbort = () => {
      rejectOnce(createAbortError())
    }

    worker.addEventListener("message", handleMessage)
    worker.addEventListener("error", handleError)
    signal?.addEventListener("abort", handleAbort)

    worker.postMessage(
      {
        type: "compare",
        payload: {
          ...request,
          source: {
            ...request.source,
            rgba: sourceRgba,
          },
          target: {
            ...request.target,
            rgba: targetRgba,
          },
        },
      } satisfies WorkerRequest,
      transferList
    )
  })
}

export async function clearBenchmarkPoolCache(
  pool: BenchmarkPoolHandle | null,
  signal?: AbortSignal
) {
  if (!pool) {
    return
  }

  await Promise.all(
    pool.workers.map((state) =>
      waitForWorkerMessage(state.worker, { type: "clear-cache" }, "cache-cleared", signal)
    )
  )
}

export async function ensureBenchmarkPool({
  existingPool,
  modelIds,
  needsEmbedding,
  poolSize,
  createWorker,
  signal,
}: EnsureBenchmarkPoolOptions): Promise<BenchmarkPoolHandle> {
  ensureNotAborted(signal)

  const requiredWorkers = Math.max(1, Math.min(3, poolSize))
  const signature = buildSignature(modelIds, needsEmbedding)
  let pool = existingPool

  if (pool && pool.signature !== signature) {
    disposeBenchmarkPool(pool)
    pool = null
  }

  if (!pool) {
    pool = {
      workers: Array.from({ length: requiredWorkers }, () =>
        createPoolWorker(createWorker)
      ),
      signature,
    }
  }

  if (pool.workers.length < requiredWorkers) {
    const delta = requiredWorkers - pool.workers.length
    pool.workers.push(
      ...Array.from({ length: delta }, () => createPoolWorker(createWorker))
    )
  }

  pool.signature = signature

  if (needsEmbedding) {
    const normalizedIds = normalizeModelIds(modelIds)
    if (!normalizedIds.length) {
      throw new Error("No model selected for embedding benchmark.")
    }

    await Promise.all(
      pool.workers.map(async (state) => {
        if (state.initializedFor === signature) {
          return
        }

        const init = await initWorkerForBenchmark(
          state.worker,
          normalizedIds,
          signal
        )
        if (!init.loadedModelIds.length) {
          throw new Error("No models loaded for benchmark worker.")
        }
        state.initializedFor = signature
      })
    )
  } else {
    for (const state of pool.workers) {
      state.initializedFor = signature
    }
  }

  return pool
}

export async function runBenchmarkPool({
  tasks,
  pool,
  callbacks,
  signal,
}: RunBenchmarkPoolOptions) {
  ensureNotAborted(signal)
  if (!tasks.length) {
    return
  }

  const workerCount = Math.max(1, Math.min(tasks.length, pool.workers.length))
  const activeWorkers = pool.workers.slice(0, workerCount)
  const queues = Array.from({ length: workerCount }, () => [] as BenchmarkTask[])

  // Keep a deterministic task-to-worker assignment for stronger cache locality.
  tasks.forEach((task, index) => {
    queues[index % workerCount].push(task)
  })

  await Promise.all(
    activeWorkers.map(async (state, workerIndex) => {
      const queue = queues[workerIndex]
      for (const task of queue) {
        ensureNotAborted(signal)
        callbacks?.onTaskStart?.(task.id)
        const started = performance.now()

        try {
          const result = await compareWithWorker(state.worker, task.request, signal)
          callbacks?.onTaskComplete?.(
            task.id,
            result,
            Math.max(0, Math.round(performance.now() - started))
          )
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            throw error
          }
          const message =
            error instanceof Error ? error.message : "Benchmark compare failed."
          callbacks?.onTaskError?.(
            task.id,
            message,
            Math.max(0, Math.round(performance.now() - started))
          )
        }
      }
    })
  )
}
