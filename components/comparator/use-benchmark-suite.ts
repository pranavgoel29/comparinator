"use client"

import * as React from "react"

import { buildBenchmarkRunSnapshot } from "@/lib/comparator/benchmark-analytics"
import { disposeBenchmarkPool, ensureBenchmarkPool, getAdaptiveBenchmarkPoolSize, runBenchmarkPool, type BenchmarkPoolHandle, type BenchmarkTask } from "@/lib/comparator/benchmark-pool"
import { normalizeUniqueModelIds } from "@/lib/comparator/model-id"
import type { CompareResult, ExpectedOutcome } from "@/lib/comparator/types"
import type { BenchmarkCase, BenchmarkCaseStatus, BenchmarkStats } from "@/components/comparator/comparator-types"

function unique(ids: string[]) {
  return normalizeUniqueModelIds(ids)
}

function createBenchmarkCaseId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `case-${Date.now()}-${Math.round(Math.random() * 100000)}`
}

type UseBenchmarkSuiteArgs = {
  benchmarkCases: BenchmarkCase[]
  selectedModelIds: string[]
  embeddingRequired: boolean
  modelStatus: "idle" | "loading" | "ready" | "error"
  embeddingWeight: number
  pixelWeight: number
  threshold: number
  createWorker: () => Worker
  setBenchmarkCases: React.Dispatch<React.SetStateAction<BenchmarkCase[]>>
  setSelectedBenchmarkCaseId: React.Dispatch<React.SetStateAction<string | null>>
  setResult: (result: CompareResult | null) => void
  setSourceCropUrl: (value: string | null) => void
  setTargetCropUrl: (value: string | null) => void
  setLatestRunSnapshot: (value: ReturnType<typeof buildBenchmarkRunSnapshot> | null) => void
  setRuntimeInfo: (value: string | null) => void
  setModelError: (value: string | null) => void
}

export function useBenchmarkSuite({
  benchmarkCases,
  selectedModelIds,
  embeddingRequired,
  modelStatus,
  embeddingWeight,
  pixelWeight,
  threshold,
  createWorker,
  setBenchmarkCases,
  setSelectedBenchmarkCaseId,
  setResult,
  setSourceCropUrl,
  setTargetCropUrl,
  setLatestRunSnapshot,
  setRuntimeInfo,
  setModelError,
}: UseBenchmarkSuiteArgs) {
  const [isRunningBenchmark, setIsRunningBenchmark] = React.useState(false)
  const benchmarkRunIdRef = React.useRef(0)
  const benchmarkAbortRef = React.useRef<AbortController | null>(null)
  const benchmarkPoolRef = React.useRef<BenchmarkPoolHandle | null>(null)

  React.useEffect(() => {
    return () => {
      benchmarkAbortRef.current?.abort()
      disposeBenchmarkPool(benchmarkPoolRef.current)
      benchmarkPoolRef.current = null
      benchmarkAbortRef.current = null
    }
  }, [])

  const benchmarkStats = React.useMemo<BenchmarkStats>(() => {
    const scored = benchmarkCases.filter((item): item is BenchmarkCase & { result: CompareResult } => item.result !== null)
    const passCount = scored.filter((item) => item.result.hybridSimilarity >= threshold).length
    const hybridScores = scored.map((item) => item.result.hybridSimilarity)
    const avgHybrid = hybridScores.length === 0 ? 0 : hybridScores.reduce((acc, score) => acc + score, 0) / hybridScores.length
    const minHybrid = hybridScores.length === 0 ? 0 : Math.min(...hybridScores)
    const maxHybrid = hybridScores.length === 0 ? 0 : Math.max(...hybridScores)
    const durations = benchmarkCases.map((item) => item.durationMs).filter((value): value is number => typeof value === "number")
    const avgDuration = durations.length === 0 ? null : Math.round(durations.reduce((acc, value) => acc + value, 0) / durations.length)
    const runningCount = benchmarkCases.filter((item) => item.status === "running").length
    const errorCount = benchmarkCases.filter((item) => item.status === "error").length
    const processedCount = benchmarkCases.filter((item) => item.status === "done" || item.status === "error").length
    const progress = benchmarkCases.length ? processedCount / benchmarkCases.length : 0
    const bestCase = scored.length === 0 ? null : scored.reduce((best, current) => (current.result.hybridSimilarity > best.result.hybridSimilarity ? current : best), scored[0])
    const worstCase = scored.length === 0 ? null : scored.reduce((worst, current) => (current.result.hybridSimilarity < worst.result.hybridSimilarity ? current : worst), scored[0])

    return {
      total: benchmarkCases.length,
      finished: scored.length,
      processedCount,
      runningCount,
      errorCount,
      progress,
      passCount,
      failCount: scored.length - passCount,
      passRate: scored.length ? passCount / scored.length : 0,
      avgHybrid,
      minHybrid,
      maxHybrid,
      avgDuration,
      bestCase,
      worstCase,
    }
  }, [benchmarkCases, threshold])

  const addCase = React.useCallback((nextCase: Omit<BenchmarkCase, "id" | "status" | "result" | "error" | "durationMs">) => {
    const entry: BenchmarkCase = {
      ...nextCase,
      id: createBenchmarkCaseId(),
      status: "idle",
      result: null,
      error: null,
      durationMs: null,
    }
    setBenchmarkCases((previous) => [...previous, entry])
  }, [setBenchmarkCases])

  const removeCase = React.useCallback((id: string) => {
    setBenchmarkCases((previous) => previous.filter((entry) => entry.id !== id))
    setSelectedBenchmarkCaseId((previous) => (previous === id ? null : previous))
  }, [setBenchmarkCases, setSelectedBenchmarkCaseId])

  const selectCase = React.useCallback((id: string | null) => {
    setSelectedBenchmarkCaseId(id)
  }, [setSelectedBenchmarkCaseId])

  const setCaseExpectedOutcome = React.useCallback((id: string, expectedOutcome: ExpectedOutcome) => {
    setBenchmarkCases((previous) => previous.map((entry) => (entry.id === id ? { ...entry, expectedOutcome } : entry)))
  }, [setBenchmarkCases])

  const clearCases = React.useCallback(() => {
    setBenchmarkCases([])
    setSelectedBenchmarkCaseId(null)
  }, [setBenchmarkCases, setSelectedBenchmarkCaseId])

  const runBenchmarkSuite = React.useCallback(async () => {
    if (!benchmarkCases.length) {
      setModelError("Add at least one benchmark case first.")
      return
    }
    if (embeddingRequired && modelStatus !== "ready") {
      setModelError("Models are still loading. Wait for ready status.")
      return
    }
    if (embeddingRequired && !selectedModelIds.length) {
      setModelError("No initialized models available for benchmark.")
      return
    }

    benchmarkAbortRef.current?.abort()
    const abortController = new AbortController()
    benchmarkAbortRef.current = abortController
    const runId = benchmarkRunIdRef.current + 1
    benchmarkRunIdRef.current = runId

    setIsRunningBenchmark(true)
    setModelError(null)
    const modelIdsForRun = embeddingRequired ? unique(selectedModelIds) : []
    const casesSnapshot = [...benchmarkCases]
    const caseLookup = new Map(casesSnapshot.map((item) => [item.id, item]))
    const runCaseState = new Map<string, BenchmarkCase>(
      casesSnapshot.map((item) => [item.id, { ...item, status: "idle" as BenchmarkCaseStatus, result: null, error: null, durationMs: null }])
    )
    const caseIds = new Set(casesSnapshot.map((item) => item.id))
    const poolSize = getAdaptiveBenchmarkPoolSize(casesSnapshot.length)

    const tasks: BenchmarkTask[] = casesSnapshot.map((item) => ({
      id: item.id,
      request: {
        source: item.sourcePayload,
        target: item.targetPayload,
        modelIds: modelIdsForRun,
        weights: {
          embedding: embeddingWeight,
          pixel: pixelWeight,
        },
      },
    }))

    try {
      const pool = await ensureBenchmarkPool({
        existingPool: benchmarkPoolRef.current,
        modelIds: modelIdsForRun,
        needsEmbedding: embeddingRequired,
        poolSize,
        createWorker,
        signal: abortController.signal,
      })
      benchmarkPoolRef.current = pool
      const activeWorkers = Math.max(1, Math.min(casesSnapshot.length, pool.workers.length))

      setRuntimeInfo(
        embeddingRequired
          ? `Benchmark started with ${activeWorkers} worker${activeWorkers > 1 ? "s" : ""} (models duplicated per worker).`
          : `Benchmark started with ${activeWorkers} worker${activeWorkers > 1 ? "s" : ""} in pixel-only mode.`
      )
      setBenchmarkCases((previous) =>
        previous.map((entry) =>
          caseIds.has(entry.id) ? { ...entry, status: "idle", result: null, error: null, durationMs: null } : entry
        )
      )

      await runBenchmarkPool({
        tasks,
        pool,
        signal: abortController.signal,
        callbacks: {
          onTaskStart: (taskId) => {
            if (benchmarkRunIdRef.current !== runId) return
            const tracked = runCaseState.get(taskId)
            if (tracked) {
              tracked.status = "running"
              tracked.error = null
            }
            setBenchmarkCases((previous) => previous.map((entry) => entry.id === taskId ? { ...entry, status: "running", error: null } : entry))
          },
          onTaskComplete: (taskId, nextResult, durationMs) => {
            if (benchmarkRunIdRef.current !== runId) return
            const tracked = runCaseState.get(taskId)
            if (tracked) {
              tracked.status = "done"
              tracked.result = nextResult
              tracked.error = null
              tracked.durationMs = durationMs
            }
            setBenchmarkCases((previous) => previous.map((entry) => entry.id === taskId ? { ...entry, status: "done", result: nextResult, error: null, durationMs } : entry))

            const taskCase = caseLookup.get(taskId)
            if (taskCase) {
              setSelectedBenchmarkCaseId(taskId)
              setResult(nextResult)
              setSourceCropUrl(taskCase.sourceDataUrl)
              setTargetCropUrl(taskCase.targetDataUrl)
            }
          },
          onTaskError: (taskId, error, durationMs) => {
            if (benchmarkRunIdRef.current !== runId) return
            const tracked = runCaseState.get(taskId)
            if (tracked) {
              tracked.status = "error"
              tracked.error = error
              tracked.durationMs = durationMs
            }
            setBenchmarkCases((previous) => previous.map((entry) => entry.id === taskId ? { ...entry, status: "error", error, durationMs } : entry))
          },
        },
      })

      if (benchmarkRunIdRef.current !== runId) {
        return
      }

      const completedRunCases = Array.from(runCaseState.values())
      setLatestRunSnapshot(
        buildBenchmarkRunSnapshot({
          cases: completedRunCases,
          threshold,
          weights: {
            embedding: embeddingWeight,
            pixel: pixelWeight,
          },
          modelIds: modelIdsForRun,
        })
      )
      setRuntimeInfo(`Benchmark completed with ${activeWorkers} worker${activeWorkers > 1 ? "s" : ""}.`)
    } catch (error) {
      if (benchmarkRunIdRef.current !== runId) {
        return
      }
      if (error instanceof DOMException && error.name === "AbortError") {
        setRuntimeInfo("Benchmark run cancelled.")
      } else {
        const message = error instanceof Error ? error.message : "Benchmark compare failed."
        setModelError(message)
      }
    } finally {
      if (benchmarkRunIdRef.current === runId) {
        setIsRunningBenchmark(false)
        if (benchmarkAbortRef.current === abortController) {
          benchmarkAbortRef.current = null
        }
      }
    }
  }, [benchmarkCases, createWorker, embeddingRequired, embeddingWeight, modelStatus, pixelWeight, selectedModelIds, setBenchmarkCases, setLatestRunSnapshot, setModelError, setResult, setRuntimeInfo, setSelectedBenchmarkCaseId, setSourceCropUrl, setTargetCropUrl, threshold])

  return {
    isRunningBenchmark,
    benchmarkStats,
    runBenchmarkSuite,
    addCase,
    removeCase,
    selectCase,
    setCaseExpectedOutcome,
    clearCases,
    benchmarkPoolRef,
  }
}
