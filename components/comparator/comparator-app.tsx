"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"

import { BBoxEditorCanvas } from "@/components/comparator/bbox-editor-canvas"
import { BBoxJsonEditor } from "@/components/comparator/bbox-json-editor"
import { ImageUploadPanel } from "@/components/comparator/image-upload-panel"
import { ResultsPanel } from "@/components/comparator/results-panel"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  buildBenchmarkRunSnapshot,
  isCorrectOutcome,
  predictedOutcomeFromScore,
} from "@/lib/comparator/benchmark-analytics"
import { createDefaultBBox, isBBoxAtLeastMinPixels } from "@/lib/comparator/bbox"
import { cropImageRegion, fileToImageBitmap, resizeCroppedRegion } from "@/lib/comparator/image"
import {
  MODEL_SELECTION_MAX_MODELS,
  normalizeModelId,
  normalizeUniqueModelIds,
  validateModelId,
  validateModelSelectionCount,
} from "@/lib/comparator/model-id"
import {
  clearBenchmarkPoolCache,
  disposeBenchmarkPool,
  ensureBenchmarkPool,
  getAdaptiveBenchmarkPoolSize,
  runBenchmarkPool,
  type BenchmarkPoolHandle,
  type BenchmarkTask,
} from "@/lib/comparator/benchmark-pool"
import {
  MODEL_CATALOG,
  MODEL_CONFIG,
  modelLabelFromId,
} from "@/lib/comparator/model-config"
import { saveLiveBenchmarkSnapshot } from "@/lib/comparator/live-snapshot"
import {
  clearLatestSession,
  loadLatestSession,
  saveLatestSession,
  type PersistedBenchmarkCaseV1,
  type PersistedSessionV1,
} from "@/lib/comparator/session-store"
import { isPass } from "@/lib/comparator/metrics"
import type {
  BenchmarkRunSnapshot,
  CompareRequest,
  CompareResult,
  ExpectedOutcome,
  ModelDownloadProgress,
  ModelRuntimeStatus,
  NormalizedBBox,
  WorkerRequest,
  WorkerResponse,
} from "@/lib/comparator/types"

const DEFAULT_THRESHOLD = 0.85
const DEFAULT_MAX_COMPARE_SIDE = 224
const SESSION_SAVE_DEBOUNCE_MS = 400
const DEFAULT_EXPECTED_OUTCOME: ExpectedOutcome = "match"

type ModelStatus = "idle" | "loading" | "ready" | "error"
type BenchmarkCaseStatus = "idle" | "running" | "done" | "error"
type BenchmarkPreset = "fast" | "balanced" | "thorough" | "custom"

type BenchmarkCase = {
  id: string
  label: string
  sourceName: string
  targetName: string
  sourceDataUrl: string
  targetDataUrl: string
  sourcePayload: CompareRequest["source"]
  targetPayload: CompareRequest["target"]
  status: BenchmarkCaseStatus
  result: CompareResult | null
  error: string | null
  durationMs: number | null
  expectedOutcome: ExpectedOutcome
}

function isBenchmarkPreset(value: unknown): value is BenchmarkPreset {
  return (
    value === "fast" ||
    value === "balanced" ||
    value === "thorough" ||
    value === "custom"
  )
}

function toRuntimeBenchmarkCase(
  persisted: PersistedBenchmarkCaseV1
): BenchmarkCase {
  return {
    id: persisted.id,
    label: persisted.label,
    sourceName: persisted.sourceName,
    targetName: persisted.targetName,
    sourceDataUrl: persisted.sourceDataUrl,
    targetDataUrl: persisted.targetDataUrl,
    sourcePayload: {
      width: persisted.sourcePayload.width,
      height: persisted.sourcePayload.height,
      rgba: new Uint8ClampedArray(persisted.sourcePayload.rgba),
    },
    targetPayload: {
      width: persisted.targetPayload.width,
      height: persisted.targetPayload.height,
      rgba: new Uint8ClampedArray(persisted.targetPayload.rgba),
    },
    status: persisted.status,
    result: persisted.result,
    error: persisted.error,
    durationMs: persisted.durationMs,
    expectedOutcome: persisted.expectedOutcome,
  }
}

function toPersistedBenchmarkCase(caseItem: BenchmarkCase): PersistedBenchmarkCaseV1 {
  return {
    id: caseItem.id,
    label: caseItem.label,
    sourceName: caseItem.sourceName,
    targetName: caseItem.targetName,
    sourceDataUrl: caseItem.sourceDataUrl,
    targetDataUrl: caseItem.targetDataUrl,
    sourcePayload: {
      width: caseItem.sourcePayload.width,
      height: caseItem.sourcePayload.height,
      rgba: new Uint8ClampedArray(caseItem.sourcePayload.rgba),
    },
    targetPayload: {
      width: caseItem.targetPayload.width,
      height: caseItem.targetPayload.height,
      rgba: new Uint8ClampedArray(caseItem.targetPayload.rgba),
    },
    expectedOutcome: caseItem.expectedOutcome,
    status: caseItem.status,
    result: caseItem.result,
    error: caseItem.error,
    durationMs: caseItem.durationMs,
  }
}

function statusChipClass(status: ModelStatus) {
  if (status === "ready") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
  }

  if (status === "loading") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200"
  }

  if (status === "error") {
    return "border-destructive/40 bg-destructive/10 text-destructive"
  }

  return "border-border bg-muted text-muted-foreground"
}

function readinessLabel(loaded: boolean) {
  return loaded ? "Loaded" : "Waiting"
}

function benchmarkStatusChipClass(status: BenchmarkCaseStatus) {
  if (status === "done") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
  }

  if (status === "running") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200"
  }

  if (status === "error") {
    return "border-destructive/40 bg-destructive/10 text-destructive"
  }

  return "border-border bg-muted text-muted-foreground"
}

function formatMs(value: number | null) {
  if (value === null) {
    return "-"
  }

  return `${value} ms`
}

function unique(ids: string[]) {
  return normalizeUniqueModelIds(ids)
}

function createBenchmarkCaseId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }

  return `case-${Date.now()}-${Math.round(Math.random() * 100000)}`
}

function formatBytes(sizeBytes: number | null) {
  if (sizeBytes === null) {
    return "unknown"
  }
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`
  }
  const units = ["KB", "MB", "GB", "TB"]
  let value = sizeBytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[unitIndex]}`
}

function modelPhaseBadgeClass(phase: ModelRuntimeStatus["phase"]) {
  if (phase === "ready") {
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
  }
  if (phase === "metadata-loading" || phase === "initializing") {
    return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
  }
  if (phase === "error") {
    return "border-destructive/40 bg-destructive/10 text-destructive"
  }
  return "border-border text-muted-foreground"
}

function formatOutcome(outcome: ExpectedOutcome) {
  return outcome === "match" ? "match" : "non-match"
}

const PRESET_MODEL_IDS: Record<Exclude<BenchmarkPreset, "custom">, string[]> = {
  fast: ["Xenova/siglip-base-patch16-224"],
  balanced: [
    "Xenova/siglip-base-patch16-224",
    "onnx-community/siglip2-base-patch16-224-ONNX",
  ],
  thorough: MODEL_CATALOG.map((model) => model.id),
}

const PRESET_COMPARE_SIZE: Record<Exclude<BenchmarkPreset, "custom">, number> = {
  fast: 160,
  balanced: 224,
  thorough: 320,
}

const PRESET_QUICK_MODE: Record<Exclude<BenchmarkPreset, "custom">, boolean> = {
  fast: true,
  balanced: false,
  thorough: false,
}

function presetLabel(preset: BenchmarkPreset) {
  if (preset === "fast") {
    return "Fast"
  }
  if (preset === "balanced") {
    return "Balanced"
  }
  if (preset === "thorough") {
    return "Thorough"
  }
  return "Custom"
}

function createComparatorWorker() {
  return new Worker(
    new URL("../../workers/embedding.worker.ts", import.meta.url),
    { type: "module" }
  )
}

export function ComparatorApp() {
  const [sourceBitmap, setSourceBitmap] = React.useState<ImageBitmap | null>(null)
  const [targetBitmap, setTargetBitmap] = React.useState<ImageBitmap | null>(null)
  const [sourceImageBlob, setSourceImageBlob] = React.useState<Blob | null>(null)
  const [targetImageBlob, setTargetImageBlob] = React.useState<Blob | null>(null)
  const [sourceFileName, setSourceFileName] = React.useState<string>()
  const [targetFileName, setTargetFileName] = React.useState<string>()
  const [sourceBBox, setSourceBBox] = React.useState<NormalizedBBox | null>(null)
  const [targetBBox, setTargetBBox] = React.useState<NormalizedBBox | null>(null)
  const [sourceLockAreaOnUpload, setSourceLockAreaOnUpload] =
    React.useState<boolean>(false)
  const [targetLockAreaOnUpload, setTargetLockAreaOnUpload] =
    React.useState<boolean>(false)
  const [threshold, setThreshold] = React.useState(DEFAULT_THRESHOLD)
  const [embeddingWeight, setEmbeddingWeight] = React.useState<number>(
    MODEL_CONFIG.hybridWeights.embedding
  )
  const [minAreaPixels, setMinAreaPixels] = React.useState<number>(
    MODEL_CONFIG.minRoiPixels
  )
  const [maxCompareSide, setMaxCompareSide] = React.useState<number>(
    DEFAULT_MAX_COMPARE_SIDE
  )
  const [quickMode, setQuickMode] = React.useState<boolean>(false)
  const [selectedPreset, setSelectedPreset] =
    React.useState<BenchmarkPreset>("custom")
  const [lastNonCustomPreset, setLastNonCustomPreset] = React.useState<
    Exclude<BenchmarkPreset, "custom"> | null
  >(null)

  const [result, setResult] = React.useState<CompareResult | null>(null)
  const [sourceCropUrl, setSourceCropUrl] = React.useState<string | null>(null)
  const [targetCropUrl, setTargetCropUrl] = React.useState<string | null>(null)
  const [selectedBenchmarkCaseId, setSelectedBenchmarkCaseId] = React.useState<
    string | null
  >(null)
  const [runtimeInfo, setRuntimeInfo] = React.useState<string | null>(null)

  const [isComparing, setIsComparing] = React.useState(false)
  const [modelStatus, setModelStatus] = React.useState<ModelStatus>("idle")
  const [modelError, setModelError] = React.useState<string | null>(null)
  const [selectedModelIds, setSelectedModelIds] = React.useState<string[]>(
    [...MODEL_CONFIG.defaultModelIds]
  )
  const [customModelId, setCustomModelId] = React.useState("")
  const [customModelError, setCustomModelError] = React.useState<string | null>(null)
  const [loadedModelIds, setLoadedModelIds] = React.useState<string[]>([])
  const [failedModelMessages, setFailedModelMessages] = React.useState<string[]>([])
  const [modelRuntimeStatuses, setModelRuntimeStatuses] = React.useState<
    Record<string, ModelRuntimeStatus>
  >({})
  const [modelDownloadProgress, setModelDownloadProgress] = React.useState<
    Record<string, ModelDownloadProgress>
  >({})
  const [isModelStatusDialogOpen, setIsModelStatusDialogOpen] =
    React.useState<boolean>(false)

  const [benchmarkCases, setBenchmarkCases] = React.useState<BenchmarkCase[]>([])
  const [latestRunSnapshot, setLatestRunSnapshot] =
    React.useState<BenchmarkRunSnapshot | null>(null)
  const [isRunningBenchmark, setIsRunningBenchmark] = React.useState(false)
  const [isSessionHydrated, setIsSessionHydrated] = React.useState(false)
  const [workerMounted, setWorkerMounted] = React.useState(false)

  const workerRef = React.useRef<Worker | null>(null)
  const sourceBitmapRef = React.useRef<ImageBitmap | null>(null)
  const targetBitmapRef = React.useRef<ImageBitmap | null>(null)
  const pendingCompareRef = React.useRef<{
    resolve: (value: CompareResult) => void
    reject: (error: Error) => void
  } | null>(null)
  const applyingPresetRef = React.useRef(false)
  const initializedAfterHydrationRef = React.useRef(false)
  const saveErrorShownRef = React.useRef(false)
  const benchmarkRunIdRef = React.useRef(0)
  const benchmarkAbortRef = React.useRef<AbortController | null>(null)
  const benchmarkPoolRef = React.useRef<BenchmarkPoolHandle | null>(null)

  const pixelWeight = React.useMemo(
    () => Number((1 - embeddingWeight).toFixed(2)),
    [embeddingWeight]
  )
  const embeddingRequired = embeddingWeight > 0

  const activeModelIds = React.useMemo(() => {
    const base = unique(loadedModelIds.length ? loadedModelIds : selectedModelIds)
    return quickMode ? base.slice(0, 1) : base
  }, [loadedModelIds, quickMode, selectedModelIds])

  const markPresetAsCustom = React.useCallback(() => {
    if (applyingPresetRef.current) {
      return
    }
    setSelectedPreset((previous) => (previous === "custom" ? previous : "custom"))
  }, [])

  const selectableModelEntries = React.useMemo(() => {
    const catalogIds = new Set(MODEL_CATALOG.map((entry) => entry.id))
    const customSelectedEntries = selectedModelIds
      .filter((modelId) => !catalogIds.has(modelId))
      .map((modelId) => ({
        id: modelId,
        label: modelId,
        notes:
          "Custom model ID. Must support Transformers.js image-feature-extraction.",
      }))

    return [...MODEL_CATALOG, ...customSelectedEntries]
  }, [selectedModelIds])

  const selectedBenchmarkCase = React.useMemo(() => {
    if (!selectedBenchmarkCaseId) {
      return null
    }
    return benchmarkCases.find((item) => item.id === selectedBenchmarkCaseId) ?? null
  }, [benchmarkCases, selectedBenchmarkCaseId])

  const modelStatusRows = React.useMemo(() => {
    return unique(selectedModelIds).map((modelId) => {
      const status = modelRuntimeStatuses[modelId]
      const progress = modelDownloadProgress[modelId]
      return (
        {
          modelId,
          phase: status?.phase ?? "idle",
          sizeBytes: status?.sizeBytes ?? progress?.total ?? null,
          sizeSource: status?.sizeSource ?? "unknown",
          error: status?.error ?? null,
          updatedAt: status?.updatedAt ?? progress?.updatedAt ?? 0,
          progress: progress?.progress ?? (status?.phase === "ready" ? 100 : null),
          progressFile: progress?.file ?? null,
          progressLoaded: progress?.loaded ?? null,
          progressTotal: progress?.total ?? null,
        }
      )
    })
  }, [modelDownloadProgress, modelRuntimeStatuses, selectedModelIds])

  const benchmarkStats = React.useMemo(() => {
    const scored = benchmarkCases.filter(
      (item): item is BenchmarkCase & { result: CompareResult } =>
        item.result !== null
    )
    const passCount = scored.filter((item) =>
      isPass(item.result.hybridSimilarity, threshold)
    ).length
    const hybridScores = scored.map((item) => item.result.hybridSimilarity)
    const avgHybrid =
      hybridScores.length === 0
        ? 0
        : hybridScores.reduce((acc, score) => acc + score, 0) / hybridScores.length

    const minHybrid =
      hybridScores.length === 0 ? 0 : Math.min(...hybridScores)
    const maxHybrid =
      hybridScores.length === 0 ? 0 : Math.max(...hybridScores)
    const durations = benchmarkCases
      .map((item) => item.durationMs)
      .filter((value): value is number => typeof value === "number")
    const avgDuration =
      durations.length === 0
        ? null
        : Math.round(durations.reduce((acc, value) => acc + value, 0) / durations.length)

    const runningCount = benchmarkCases.filter((item) => item.status === "running").length
    const errorCount = benchmarkCases.filter((item) => item.status === "error").length
    const processedCount = benchmarkCases.filter(
      (item) => item.status === "done" || item.status === "error"
    ).length
    const progress = benchmarkCases.length
      ? processedCount / benchmarkCases.length
      : 0

    const bestCase =
      scored.length === 0
        ? null
        : scored.reduce((best, current) => {
            return current.result.hybridSimilarity > best.result.hybridSimilarity ? current : best
          }, scored[0])

    const worstCase =
      scored.length === 0
        ? null
        : scored.reduce((worst, current) => {
            return current.result.hybridSimilarity < worst.result.hybridSimilarity ? current : worst
          }, scored[0])

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

  const analyticsSnapshotFromCurrentResults = React.useMemo(() => {
    const hasAnyProcessed = benchmarkCases.some(
      (item) => item.status === "done" || item.status === "error"
    )
    if (!hasAnyProcessed) {
      return latestRunSnapshot
    }

    const modelIdsFromResults = unique(
      benchmarkCases.flatMap((item) =>
        item.result ? item.result.perModelScores.map((model) => model.modelId) : []
      )
    )
    const modelIdsForSnapshot = unique([...selectedModelIds, ...modelIdsFromResults])

    return buildBenchmarkRunSnapshot({
      cases: benchmarkCases,
      threshold,
      weights: {
        embedding: embeddingWeight,
        pixel: pixelWeight,
      },
      modelIds: modelIdsForSnapshot,
    })
  }, [
    benchmarkCases,
    embeddingWeight,
    latestRunSnapshot,
    pixelWeight,
    selectedModelIds,
    threshold,
  ])

  const initWorkerModels = React.useCallback((modelIds: string[]) => {
    if (!workerRef.current) {
      return
    }
    const nextModelIds = unique(modelIds)
    if (!validateModelSelectionCount(nextModelIds)) {
      setModelError(
        `Select at most ${MODEL_SELECTION_MAX_MODELS} models.`
      )
      return
    }
    const invalidModel = nextModelIds.find((modelId) => Boolean(validateModelId(modelId)))
    if (invalidModel) {
      setModelError(validateModelId(invalidModel))
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

    workerRef.current.postMessage({
      type: "init-model",
      payload: { modelIds: nextModelIds },
    } satisfies WorkerRequest)
  }, [])

  const applyPreset = React.useCallback(
    (preset: Exclude<BenchmarkPreset, "custom">) => {
      const modelIds = unique(PRESET_MODEL_IDS[preset])
      applyingPresetRef.current = true
      setSelectedPreset(preset)
      setLastNonCustomPreset(preset)
      setSelectedModelIds(modelIds)
      setQuickMode(PRESET_QUICK_MODE[preset])
      setMaxCompareSide(PRESET_COMPARE_SIZE[preset])
      setRuntimeInfo(`${presetLabel(preset)} preset applied.`)
      initWorkerModels(modelIds)
      applyingPresetRef.current = false
    },
    [initWorkerModels]
  )

  const executeCompare = React.useCallback(
    (payload: CompareRequest) => {
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

        workerRef.current?.postMessage(
          {
            type: "compare",
            payload,
          } satisfies WorkerRequest,
          transferList
        )
      })
    },
    []
  )

  React.useEffect(() => {
    const worker = createComparatorWorker()

    workerRef.current = worker
    setWorkerMounted(true)

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data
      if (message.type === "model-progress") {
        setModelDownloadProgress((previous) => ({
          ...previous,
          [message.payload.modelId]: message.payload,
        }))
        return
      }
      if (message.type === "model-status") {
        setModelRuntimeStatuses((previous) => ({
          ...previous,
          [message.payload.modelId]: message.payload,
        }))
        return
      }

      if (message.type === "model-ready") {
        setLoadedModelIds(message.payload.loadedModelIds)
        setModelRuntimeStatuses((previous) => {
          const next = { ...previous }
          for (const status of message.payload.modelStatuses) {
            next[status.modelId] = status
          }
          return next
        })
        setFailedModelMessages(
          message.payload.failedModels.map(
            (item) => `${modelLabelFromId(item.modelId)}: ${item.error}`
          )
        )
        setModelStatus(message.payload.loadedModelIds.length ? "ready" : "error")
        setModelError(
          message.payload.loadedModelIds.length
            ? null
            : "None of the selected models initialized successfully."
        )
        return
      }

      if (message.type === "compare-result") {
        if (pendingCompareRef.current) {
          pendingCompareRef.current.resolve(message.payload)
          pendingCompareRef.current = null
          return
        }

        setResult(message.payload)
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
  }, [])

  React.useEffect(() => {
    sourceBitmapRef.current = sourceBitmap
  }, [sourceBitmap])

  React.useEffect(() => {
    targetBitmapRef.current = targetBitmap
  }, [targetBitmap])

  React.useEffect(() => {
    return () => {
      sourceBitmapRef.current?.close()
      targetBitmapRef.current?.close()
    }
  }, [])

  React.useEffect(() => {
    return () => {
      benchmarkAbortRef.current?.abort()
      disposeBenchmarkPool(benchmarkPoolRef.current)
      benchmarkPoolRef.current = null
      benchmarkAbortRef.current = null
    }
  }, [])

  React.useEffect(() => {
    let cancelled = false

    const hydrateSession = async () => {
      if (typeof indexedDB === "undefined") {
        if (!cancelled) {
          setRuntimeInfo("Session persistence is unavailable in this browser.")
          setIsSessionHydrated(true)
        }
        return
      }

      try {
        const session = await loadLatestSession()
        if (cancelled || !session) {
          return
        }

        const restoreImage = async (
          entry: PersistedSessionV1["source"],
          kind: "source" | "target"
        ) => {
          if (!entry) {
            if (kind === "source") {
              setSourceBitmap((previous) => {
                previous?.close()
                return null
              })
              setSourceImageBlob(null)
              setSourceFileName(undefined)
              setSourceBBox(null)
              setSourceLockAreaOnUpload(false)
            } else {
              setTargetBitmap((previous) => {
                previous?.close()
                return null
              })
              setTargetImageBlob(null)
              setTargetFileName(undefined)
              setTargetBBox(null)
              setTargetLockAreaOnUpload(false)
            }
            return
          }

          const bitmap = await createImageBitmap(entry.imageBlob)
          if (cancelled) {
            bitmap.close()
            return
          }

          if (kind === "source") {
            setSourceBitmap((previous) => {
              previous?.close()
              return bitmap
            })
            setSourceImageBlob(entry.imageBlob)
            setSourceFileName(entry.fileName)
            setSourceBBox(entry.bbox ?? createDefaultBBox())
            setSourceLockAreaOnUpload(entry.lockOnUpload)
            return
          }

          setTargetBitmap((previous) => {
            previous?.close()
            return bitmap
          })
          setTargetImageBlob(entry.imageBlob)
          setTargetFileName(entry.fileName)
          setTargetBBox(entry.bbox ?? createDefaultBBox())
          setTargetLockAreaOnUpload(entry.lockOnUpload)
        }

        await restoreImage(session.source, "source")
        await restoreImage(session.target, "target")
        if (cancelled) {
          return
        }

        setThreshold(session.controls.threshold)
        setEmbeddingWeight(session.controls.embeddingWeight)
        setMinAreaPixels(session.controls.minAreaPixels)
        setMaxCompareSide(session.controls.maxCompareSide)
        setQuickMode(session.controls.quickMode)
        setSelectedPreset(
          isBenchmarkPreset(session.controls.selectedPreset)
            ? session.controls.selectedPreset
            : "custom"
        )
        setLastNonCustomPreset(session.controls.lastNonCustomPreset)
        setSelectedModelIds(
          session.controls.selectedModelIds.length
            ? unique(session.controls.selectedModelIds).slice(
                0,
                MODEL_SELECTION_MAX_MODELS
              )
            : [...MODEL_CONFIG.defaultModelIds]
        )

        const restoredCases = session.benchmark.cases.map((item) =>
          toRuntimeBenchmarkCase(item)
        )
        setBenchmarkCases(restoredCases)
        setLatestRunSnapshot(session.benchmark.latestRunSnapshot)

        const selectedId =
          session.benchmark.selectedBenchmarkCaseId &&
          restoredCases.some((item) => item.id === session.benchmark.selectedBenchmarkCaseId)
            ? session.benchmark.selectedBenchmarkCaseId
            : null
        setSelectedBenchmarkCaseId(selectedId)
        if (selectedId) {
          const selectedCase =
            restoredCases.find((item) => item.id === selectedId) ?? null
          setResult(selectedCase?.result ?? null)
          setSourceCropUrl(selectedCase?.sourceDataUrl ?? null)
          setTargetCropUrl(selectedCase?.targetDataUrl ?? null)
        }
        setRuntimeInfo("Restored previous session.")
      } catch (error) {
        if (cancelled) {
          return
        }

        const message =
          error instanceof Error
            ? error.message
            : "Could not restore previous session."
        setRuntimeInfo(`Session restore skipped: ${message}`)
      } finally {
        if (!cancelled) {
          setIsSessionHydrated(true)
        }
      }
    }

    hydrateSession()

    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    if (!isSessionHydrated || !workerMounted || initializedAfterHydrationRef.current) {
      return
    }

    initializedAfterHydrationRef.current = true
    initWorkerModels(selectedModelIds.length ? selectedModelIds : [...MODEL_CONFIG.defaultModelIds])
  }, [initWorkerModels, isSessionHydrated, selectedModelIds, workerMounted])

  React.useEffect(() => {
    if (!isSessionHydrated || isRunningBenchmark) {
      return
    }

    const timer = window.setTimeout(async () => {
      const sourceSelection =
        sourceImageBlob && sourceFileName
          ? {
              fileName: sourceFileName,
              imageBlob: sourceImageBlob,
              bbox: sourceBBox,
              lockOnUpload: sourceLockAreaOnUpload,
            }
          : null

      const targetSelection =
        targetImageBlob && targetFileName
          ? {
              fileName: targetFileName,
              imageBlob: targetImageBlob,
              bbox: targetBBox,
              lockOnUpload: targetLockAreaOnUpload,
            }
          : null

      const persistedCases = benchmarkCases.map((item) =>
        toPersistedBenchmarkCase(item)
      )
      const selectedId =
        selectedBenchmarkCaseId &&
        persistedCases.some((item) => item.id === selectedBenchmarkCaseId)
          ? selectedBenchmarkCaseId
          : null
      const nextModelIds = selectedModelIds.length
        ? unique(selectedModelIds)
        : [...MODEL_CONFIG.defaultModelIds]

      const payload: PersistedSessionV1 = {
        version: 1,
        savedAt: Date.now(),
        source: sourceSelection,
        target: targetSelection,
        controls: {
          threshold,
          embeddingWeight,
          minAreaPixels,
          maxCompareSide,
          quickMode,
          selectedPreset: selectedPreset,
          lastNonCustomPreset,
          selectedModelIds: nextModelIds,
        },
        benchmark: {
          cases: persistedCases,
          selectedBenchmarkCaseId: selectedId,
          latestRunSnapshot,
        },
      }

      try {
        await saveLatestSession(payload)
        if (saveErrorShownRef.current) {
          setModelError((previous) =>
            previous?.includes("Could not persist session") ? null : previous
          )
          saveErrorShownRef.current = false
        }
      } catch {
        if (!saveErrorShownRef.current) {
          setModelError(
            "Could not persist session (storage quota exceeded or browser storage unavailable)."
          )
          saveErrorShownRef.current = true
        }
      }
    }, SESSION_SAVE_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [
    benchmarkCases,
    embeddingWeight,
    isRunningBenchmark,
    isSessionHydrated,
    lastNonCustomPreset,
    latestRunSnapshot,
    maxCompareSide,
    minAreaPixels,
    quickMode,
    selectedBenchmarkCaseId,
    selectedModelIds,
    selectedPreset,
    sourceBBox,
    sourceFileName,
    sourceImageBlob,
    sourceLockAreaOnUpload,
    targetBBox,
    targetFileName,
    targetImageBlob,
    targetLockAreaOnUpload,
    threshold,
  ])

  React.useEffect(() => {
    saveLiveBenchmarkSnapshot(analyticsSnapshotFromCurrentResults)
  }, [analyticsSnapshotFromCurrentResults])

  const sourceDimensions = sourceBitmap
    ? { width: sourceBitmap.width, height: sourceBitmap.height }
    : null
  const targetDimensions = targetBitmap
    ? { width: targetBitmap.width, height: targetBitmap.height }
    : null

  const uploadImage = React.useCallback(
    async (kind: "source" | "target", file: File) => {
      try {
        const bitmap = await fileToImageBitmap(file)

        if (kind === "source") {
          setSourceBitmap((previous) => {
            previous?.close()
            return bitmap
          })
          setSourceImageBlob(file)
          setSourceFileName(file.name)
          setSourceBBox((previous) => {
            if (sourceLockAreaOnUpload && previous) {
              return previous
            }
            return createDefaultBBox()
          })
        } else {
          setTargetBitmap((previous) => {
            previous?.close()
            return bitmap
          })
          setTargetImageBlob(file)
          setTargetFileName(file.name)
          setTargetBBox((previous) => {
            if (targetLockAreaOnUpload && previous) {
              return previous
            }
            return createDefaultBBox()
          })
        }

        setModelError(null)
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to process selected image."
        setModelError(message)
      }
    },
    [sourceLockAreaOnUpload, targetLockAreaOnUpload]
  )

  const buildCompareRequestFromActivePair = React.useCallback(() => {
    if (!sourceBitmap || !targetBitmap || !sourceBBox || !targetBBox) {
      throw new Error("Upload both images and set a selected area in each image.")
    }

    if (
      !isBBoxAtLeastMinPixels(
        sourceBBox,
        {
          width: sourceBitmap.width,
          height: sourceBitmap.height,
        },
        minAreaPixels
      )
    ) {
      throw new Error(
        `Source selected area must be at least ${minAreaPixels}x${minAreaPixels} pixels.`
      )
    }

    if (
      !isBBoxAtLeastMinPixels(
        targetBBox,
        {
          width: targetBitmap.width,
          height: targetBitmap.height,
        },
        minAreaPixels
      )
    ) {
      throw new Error(
        `Target selected area must be at least ${minAreaPixels}x${minAreaPixels} pixels.`
      )
    }

    if (embeddingRequired && !activeModelIds.length) {
      throw new Error("No initialized models available for compare.")
    }

    const sourceRegion = resizeCroppedRegion(
      cropImageRegion(sourceBitmap, sourceBBox),
      maxCompareSide
    )
    const targetRegion = resizeCroppedRegion(
      cropImageRegion(targetBitmap, targetBBox),
      maxCompareSide
    )

    const request: CompareRequest = {
      source: {
        width: sourceRegion.width,
        height: sourceRegion.height,
        rgba: new Uint8ClampedArray(sourceRegion.imageData.data),
      },
      target: {
        width: targetRegion.width,
        height: targetRegion.height,
        rgba: new Uint8ClampedArray(targetRegion.imageData.data),
      },
      modelIds: embeddingRequired ? activeModelIds : [],
      weights: {
        embedding: embeddingWeight,
        pixel: pixelWeight,
      },
    }

    return {
      sourceRegion,
      targetRegion,
      request,
    }
  }, [
    activeModelIds,
    embeddingWeight,
    embeddingRequired,
    maxCompareSide,
    minAreaPixels,
    pixelWeight,
    sourceBBox,
    sourceBitmap,
    targetBBox,
    targetBitmap,
  ])

  const runCompare = React.useCallback(async () => {
    if (embeddingRequired && modelStatus !== "ready") {
      setModelError("Models are still loading. Wait for ready status.")
      return
    }

    try {
      const { sourceRegion, targetRegion, request } =
        buildCompareRequestFromActivePair()

      setSelectedBenchmarkCaseId(null)
      setSourceCropUrl(sourceRegion.dataUrl)
      setTargetCropUrl(targetRegion.dataUrl)
      setIsComparing(true)
      setModelError(null)
      setRuntimeInfo(null)

      const nextResult = await executeCompare(request)
      setResult(nextResult)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Comparison failed unexpectedly."
      setModelError(message)
    } finally {
      setIsComparing(false)
    }
  }, [buildCompareRequestFromActivePair, embeddingRequired, executeCompare, modelStatus])

  const toggleModel = React.useCallback(
    (modelId: string, checked: boolean) => {
      const normalizedModelId = normalizeModelId(modelId)
      const next = checked
        ? unique([...selectedModelIds, normalizedModelId])
        : selectedModelIds.filter((id) => id !== normalizedModelId)

      if (!next.length) {
        setModelError("Select at least one model.")
        return
      }
      if (!validateModelSelectionCount(next)) {
        setModelError(
          `Select at most ${MODEL_SELECTION_MAX_MODELS} models.`
        )
        return
      }
      const invalidModel = next.find((entry) => Boolean(validateModelId(entry)))
      if (invalidModel) {
        setModelError(validateModelId(invalidModel))
        return
      }

      markPresetAsCustom()
      setSelectedModelIds(next)
      initWorkerModels(next)
    },
    [initWorkerModels, markPresetAsCustom, selectedModelIds]
  )

  const addCustomModel = React.useCallback(() => {
    const modelId = normalizeModelId(customModelId)

    if (!modelId) {
      setCustomModelError("Enter a model ID.")
      return
    }

    const validationError = validateModelId(modelId)
    if (validationError) {
      setCustomModelError(validationError)
      return
    }

    if (selectedModelIds.includes(modelId)) {
      setCustomModelError("Model is already selected.")
      return
    }

    const next = unique([...selectedModelIds, modelId])
    if (!validateModelSelectionCount(next)) {
      setCustomModelError(
        `Select at most ${MODEL_SELECTION_MAX_MODELS} models.`
      )
      return
    }
    markPresetAsCustom()
    setSelectedModelIds(next)
    setCustomModelId("")
    setCustomModelError(null)
    setModelError(null)
    initWorkerModels(next)
  }, [customModelId, initWorkerModels, markPresetAsCustom, selectedModelIds])

  const handleQuickModeChange = React.useCallback(
    (nextValue: boolean) => {
      setQuickMode(nextValue)
      markPresetAsCustom()
    },
    [markPresetAsCustom]
  )

  const handleMaxCompareSideChange = React.useCallback(
    (nextValue: number) => {
      setMaxCompareSide(nextValue)
      markPresetAsCustom()
    },
    [markPresetAsCustom]
  )

  const clearRuntimeCache = React.useCallback(async () => {
    if (!workerRef.current) {
      setModelError("Worker is not ready yet.")
      return
    }
    workerRef.current.postMessage({ type: "clear-cache" } satisfies WorkerRequest)
    try {
      await clearBenchmarkPoolCache(benchmarkPoolRef.current)
      setRuntimeInfo("Runtime cache cleared for live and benchmark workers.")
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to clear benchmark cache."
      setModelError(message)
    }
  }, [])

  const clearSavedSession = React.useCallback(async () => {
    try {
      await clearLatestSession()
      setRuntimeInfo("Saved session cleared from browser storage.")
      setModelError(null)
      setLatestRunSnapshot(null)
      saveLiveBenchmarkSnapshot(null)
      saveErrorShownRef.current = false
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to clear saved session."
      setModelError(message)
    }
  }, [])

  const addCurrentPairToBenchmark = React.useCallback(() => {
    try {
      const { sourceRegion, targetRegion, request } = buildCompareRequestFromActivePair()

      const sourceName = sourceFileName || "source-image"
      const targetName = targetFileName || "target-image"
      const label = `${sourceName} vs ${targetName}`

      const nextCase: BenchmarkCase = {
        id: createBenchmarkCaseId(),
        label,
        sourceName,
        targetName,
        sourceDataUrl: sourceRegion.dataUrl,
        targetDataUrl: targetRegion.dataUrl,
        sourcePayload: {
          width: request.source.width,
          height: request.source.height,
          rgba: new Uint8ClampedArray(request.source.rgba),
        },
        targetPayload: {
          width: request.target.width,
          height: request.target.height,
          rgba: new Uint8ClampedArray(request.target.rgba),
        },
        status: "idle",
        result: null,
        error: null,
        durationMs: null,
        expectedOutcome: DEFAULT_EXPECTED_OUTCOME,
      }

      setBenchmarkCases((previous) => [...previous, nextCase])
      setModelError(null)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not add benchmark case."
      setModelError(message)
    }
  }, [
    buildCompareRequestFromActivePair,
    sourceFileName,
    targetFileName,
  ])

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
      casesSnapshot.map((item) => [
        item.id,
        {
          ...item,
          status: "idle" as BenchmarkCaseStatus,
          result: null,
          error: null,
          durationMs: null,
        },
      ])
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
        createWorker: createComparatorWorker,
        signal: abortController.signal,
      })
      benchmarkPoolRef.current = pool
      const activeWorkers = Math.max(
        1,
        Math.min(casesSnapshot.length, pool.workers.length)
      )

      setRuntimeInfo(
        embeddingRequired
          ? `Benchmark started with ${activeWorkers} worker${activeWorkers > 1 ? "s" : ""} (models duplicated per worker).`
          : `Benchmark started with ${activeWorkers} worker${activeWorkers > 1 ? "s" : ""} in pixel-only mode.`
      )
      setBenchmarkCases((previous) =>
        previous.map((entry) =>
          caseIds.has(entry.id)
            ? {
                ...entry,
                status: "idle",
                result: null,
                error: null,
                durationMs: null,
              }
            : entry
        )
      )

      await runBenchmarkPool({
        tasks,
        pool,
        signal: abortController.signal,
        callbacks: {
          onTaskStart: (taskId) => {
            if (benchmarkRunIdRef.current !== runId) {
              return
            }
            const tracked = runCaseState.get(taskId)
            if (tracked) {
              tracked.status = "running"
              tracked.error = null
            }
            setBenchmarkCases((previous) =>
              previous.map((entry) =>
                entry.id === taskId
                  ? {
                      ...entry,
                      status: "running",
                      error: null,
                    }
                  : entry
              )
            )
          },
          onTaskComplete: (taskId, nextResult, durationMs) => {
            if (benchmarkRunIdRef.current !== runId) {
              return
            }
            const tracked = runCaseState.get(taskId)
            if (tracked) {
              tracked.status = "done"
              tracked.result = nextResult
              tracked.error = null
              tracked.durationMs = durationMs
            }
            setBenchmarkCases((previous) =>
              previous.map((entry) =>
                entry.id === taskId
                  ? {
                      ...entry,
                      status: "done",
                      result: nextResult,
                      error: null,
                      durationMs,
                    }
                  : entry
              )
            )

            const taskCase = caseLookup.get(taskId)
            if (taskCase) {
              setSelectedBenchmarkCaseId(taskId)
              setResult(nextResult)
              setSourceCropUrl(taskCase.sourceDataUrl)
              setTargetCropUrl(taskCase.targetDataUrl)
            }
          },
          onTaskError: (taskId, error, durationMs) => {
            if (benchmarkRunIdRef.current !== runId) {
              return
            }
            const tracked = runCaseState.get(taskId)
            if (tracked) {
              tracked.status = "error"
              tracked.error = error
              tracked.durationMs = durationMs
            }
            setBenchmarkCases((previous) =>
              previous.map((entry) =>
                entry.id === taskId
                  ? {
                      ...entry,
                      status: "error",
                      error,
                      durationMs,
                    }
                  : entry
              )
            )
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
      setRuntimeInfo(
        `Benchmark completed with ${activeWorkers} worker${activeWorkers > 1 ? "s" : ""}.`
      )
    } catch (error) {
      if (benchmarkRunIdRef.current !== runId) {
        return
      }

      if (error instanceof DOMException && error.name === "AbortError") {
        setRuntimeInfo("Benchmark run cancelled.")
      } else {
        const message =
          error instanceof Error ? error.message : "Benchmark compare failed."
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
  }, [
    benchmarkCases,
    embeddingRequired,
    embeddingWeight,
    modelStatus,
    pixelWeight,
    selectedModelIds,
    threshold,
  ])

  const removeBenchmarkCase = React.useCallback((id: string) => {
    setBenchmarkCases((previous) => previous.filter((entry) => entry.id !== id))
    setSelectedBenchmarkCaseId((previous) => (previous === id ? null : previous))
  }, [])

  const setBenchmarkCaseExpectedOutcome = React.useCallback(
    (id: string, expectedOutcome: ExpectedOutcome) => {
      setBenchmarkCases((previous) =>
        previous.map((entry) =>
          entry.id === id ? { ...entry, expectedOutcome } : entry
        )
      )
    },
    []
  )

  const selectBenchmarkCase = React.useCallback((id: string) => {
    setSelectedBenchmarkCaseId(id)
  }, [])

  const canCompare =
    (!embeddingRequired || modelStatus === "ready") &&
    !isComparing &&
    !isRunningBenchmark &&
    (!embeddingRequired || activeModelIds.length > 0) &&
    Boolean(sourceBitmap && targetBitmap && sourceBBox && targetBBox)
  const canRunBenchmark =
    !isComparing &&
    !isRunningBenchmark &&
    benchmarkCases.length > 0 &&
    (!embeddingRequired ||
      (modelStatus === "ready" && activeModelIds.length > 0))

  const displayedResult = selectedBenchmarkCase?.result ?? result
  const displayedSourceCropUrl = selectedBenchmarkCase?.sourceDataUrl ?? sourceCropUrl
  const displayedTargetCropUrl = selectedBenchmarkCase?.targetDataUrl ?? targetCropUrl
  const resultsViewMode: "benchmark" | "live" = selectedBenchmarkCase
    ? "benchmark"
    : "live"
  const selectedCaseDurationMs =
    selectedBenchmarkCase?.result?.timingsMs.total ??
    selectedBenchmarkCase?.durationMs ??
    null

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <Card className="border-border/80 bg-card shadow-sm">
          <CardHeader className="gap-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Benchmark Playground
              </p>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Image Area Comparator
              </h1>
              <p className="max-w-3xl text-sm text-muted-foreground">
                Compare selected areas across images, tune speed and scoring, then run a full benchmark suite over many saved pairs.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">Source: {readinessLabel(Boolean(sourceBitmap))}</Badge>
                <Badge variant="outline">Target: {readinessLabel(Boolean(targetBitmap))}</Badge>
                <Badge variant="outline">
                  Active models: {activeModelIds.length}
                </Badge>
                <Badge className={statusChipClass(modelStatus)}>Engine: {modelStatus}</Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <AlertDialog
                  open={isModelStatusDialogOpen}
                  onOpenChange={setIsModelStatusDialogOpen}
                >
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      Model status
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="max-h-[85vh] max-w-4xl overflow-hidden">
                    <AlertDialogHeader className="items-start text-left">
                      <AlertDialogTitle>Model runtime status</AlertDialogTitle>
                      <AlertDialogDescription>
                        Live status from model initialization and metadata fetching.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="overflow-auto rounded-md border border-border">
                      <table className="min-w-full border-collapse text-xs">
                        <thead className="bg-muted/40 text-muted-foreground">
                          <tr>
                            <th className="px-2 py-2 text-left font-medium">Model</th>
                            <th className="px-2 py-2 text-left font-medium">Status</th>
                            <th className="px-2 py-2 text-left font-medium">Progress</th>
                            <th className="px-2 py-2 text-left font-medium">Size</th>
                            <th className="px-2 py-2 text-left font-medium">Source</th>
                            <th className="px-2 py-2 text-left font-medium">Updated</th>
                            <th className="px-2 py-2 text-left font-medium">Error</th>
                          </tr>
                        </thead>
                        <tbody>
                          {modelStatusRows.map((status) => (
                            <tr key={status.modelId} className="border-t border-border/60">
                              <td className="px-2 py-2 align-top text-foreground">
                                {modelLabelFromId(status.modelId)}
                              </td>
                              <td className="px-2 py-2 align-top">
                                <Badge
                                  variant="outline"
                                  className={modelPhaseBadgeClass(status.phase)}
                                >
                                  {status.phase}
                                </Badge>
                              </td>
                              <td className="max-w-[220px] px-2 py-2 align-top text-muted-foreground">
                                {typeof status.progress === "number" ? (
                                  <div className="space-y-1">
                                    <div className="h-1.5 overflow-hidden rounded bg-muted">
                                      <div
                                        className="h-full rounded bg-primary"
                                        style={{
                                          width: `${Math.max(
                                            0,
                                            Math.min(100, status.progress)
                                          )}%`,
                                        }}
                                      />
                                    </div>
                                    <p>{status.progress.toFixed(0)}%</p>
                                    {status.progressFile ? (
                                      <p className="truncate">{status.progressFile}</p>
                                    ) : null}
                                  </div>
                                ) : (
                                  "-"
                                )}
                              </td>
                              <td className="px-2 py-2 align-top text-foreground">
                                {formatBytes(status.sizeBytes)}
                              </td>
                              <td className="px-2 py-2 align-top text-muted-foreground">
                                {status.sizeSource === "huggingface-api"
                                  ? "huggingface-api"
                                  : status.progressTotal
                                    ? "transformers-download"
                                    : "unknown"}
                              </td>
                              <td className="px-2 py-2 align-top text-muted-foreground">
                                {status.updatedAt
                                  ? new Date(status.updatedAt).toLocaleTimeString()
                                  : "-"}
                              </td>
                              <td className="max-w-[280px] px-2 py-2 align-top text-destructive">
                                {status.error ?? "-"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Close</AlertDialogCancel>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearSavedSession}
                  disabled={isComparing || isRunningBenchmark}
                >
                  Clear saved session
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <div className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm">
            <ImageUploadPanel
              title="Source Reference"
              subtitle="Upload source image and mark the area to compare"
              fileName={sourceFileName}
              dimensions={sourceDimensions}
              onSelect={(file) => uploadImage("source", file)}
            >
              <BBoxJsonEditor
                title="Source Area"
                bbox={sourceBBox}
                dimensions={sourceDimensions}
                onApply={setSourceBBox}
                lockOnUpload={sourceLockAreaOnUpload}
                onLockOnUploadChange={setSourceLockAreaOnUpload}
              />
            </ImageUploadPanel>
            <BBoxEditorCanvas
              image={sourceBitmap}
              bbox={sourceBBox}
              onChange={setSourceBBox}
              editable
              label="Source Area"
              minPixels={minAreaPixels}
            />
          </div>

          <div className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm">
            <ImageUploadPanel
              title="Target Candidate"
              subtitle="Upload target image and mark the matching area"
              fileName={targetFileName}
              dimensions={targetDimensions}
              onSelect={(file) => uploadImage("target", file)}
            >
              <BBoxJsonEditor
                title="Target Area"
                bbox={targetBBox}
                dimensions={targetDimensions}
                onApply={setTargetBBox}
                lockOnUpload={targetLockAreaOnUpload}
                onLockOnUploadChange={setTargetLockAreaOnUpload}
              />
            </ImageUploadPanel>
            <BBoxEditorCanvas
              image={targetBitmap}
              bbox={targetBBox}
              editable
              onChange={setTargetBBox}
              label="Target Area"
              minPixels={minAreaPixels}
            />
          </div>
        </section>

        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="space-y-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Control Center
            </CardTitle>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Tune decision strictness, speed, and models here. Then run one compare or add the current pair to your benchmark suite.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 rounded-xl border border-border bg-muted/25 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Speed Presets
                </h3>
                <Badge variant="outline">Mode: {presetLabel(selectedPreset)}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Presets are one-click starting points. You can still edit all controls manually at any time.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={selectedPreset === "fast" ? "default" : "outline"}
                  onClick={() => applyPreset("fast")}
                >
                  Fast
                </Button>
                <Button
                  type="button"
                  variant={selectedPreset === "balanced" ? "default" : "outline"}
                  onClick={() => applyPreset("balanced")}
                >
                  Balanced
                </Button>
                <Button
                  type="button"
                  variant={selectedPreset === "thorough" ? "default" : "outline"}
                  onClick={() => applyPreset("thorough")}
                >
                  Thorough
                </Button>
                {selectedPreset === "custom" && lastNonCustomPreset ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => applyPreset(lastNonCustomPreset)}
                  >
                    Reapply {presetLabel(lastNonCustomPreset)}
                  </Button>
                ) : null}
              </div>
              <div className="rounded-lg border border-border bg-background/80 p-3 text-xs text-muted-foreground">
                <p>
                  This app now defaults to newer vision encoders (SigLIP and SigLIP2). CLIP options remain available as legacy fallbacks.
                </p>
                <p className="mt-1">
                  Fast preset uses SigLIP-only with smaller compare size. Balanced combines SigLIP + SigLIP2. Final score still combines model semantics and pixel similarity using your weights.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="space-y-3 rounded-xl border border-border bg-muted/25 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Decision Settings
                  </h3>
                  <Badge variant="outline">Threshold {threshold.toFixed(2)}</Badge>
                </div>

                <div className="space-y-2 rounded-lg border border-border bg-background/80 p-3">
                  <div className="flex items-center justify-between text-sm font-medium">
                    <span>Pass/Fail cutoff</span>
                    <span>{threshold.toFixed(2)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Higher cutoff means stricter matching. Lower cutoff is more lenient.
                  </p>
                  <input
                    type="range"
                    min={0.5}
                    max={0.99}
                    step={0.01}
                    value={threshold}
                    onChange={(event) => setThreshold(Number(event.target.value))}
                    className="w-full accent-primary"
                  />
                </div>

                <div className="space-y-2 rounded-lg border border-border bg-background/80 p-3">
                  <div className="flex items-center justify-between text-sm font-medium">
                    <span>Semantic (model) weight</span>
                    <span>{embeddingWeight.toFixed(2)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Increase this to trust model understanding more. Decrease this to trust direct pixel difference more.
                  </p>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={embeddingWeight}
                    onChange={(event) =>
                      setEmbeddingWeight(Number(event.currentTarget.value))
                    }
                    className="w-full accent-primary"
                  />
                  <p className="text-xs text-muted-foreground">
                    Pixel weight auto-calculates to{" "}
                    <span className="font-semibold text-foreground">{pixelWeight.toFixed(2)}</span>.
                  </p>
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-border bg-muted/25 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Speed Settings
                </h3>

                <div className="space-y-2 rounded-lg border border-border bg-background/80 p-3">
                  <div className="flex items-center justify-between text-sm font-medium">
                    <span>Minimum area size</span>
                    <span>{minAreaPixels}px</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Smallest allowed width or height of the selected area. Default 24px helps avoid unstable scores from tiny crops.
                  </p>
                  <input
                    type="range"
                    min={8}
                    max={96}
                    step={4}
                    value={minAreaPixels}
                    onChange={(event) =>
                      setMinAreaPixels(Number(event.currentTarget.value))
                    }
                    className="w-full accent-primary"
                  />
                </div>

                <div className="space-y-2 rounded-lg border border-border bg-background/80 p-3">
                  <div className="flex items-center justify-between text-sm font-medium">
                    <span>Compare size</span>
                    <span>{maxCompareSide}px</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Lower size is faster but less detailed. Higher size keeps more detail but is slower.
                  </p>
                  <input
                    type="range"
                    min={96}
                    max={512}
                    step={32}
                    value={maxCompareSide}
                    onChange={(event) =>
                      handleMaxCompareSideChange(Number(event.currentTarget.value))
                    }
                    className="w-full accent-primary"
                  />
                </div>

                <label className="flex items-start gap-2 rounded-lg border border-border bg-background/80 p-3 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={quickMode}
                    onChange={(event) =>
                      handleQuickModeChange(event.currentTarget.checked)
                    }
                    className="mt-0.5 accent-primary"
                  />
                  <span>
                    <span className="block font-medium text-foreground">Quick mode</span>
                    <span className="text-xs">
                      Run only the first loaded model for faster responses.
                    </span>
                  </span>
                </label>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-border bg-muted/25 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Model Selection
                </h3>
                <Badge variant="outline">{selectedModelIds.length} selected</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Pick one or more models. To stay conservative, the final model score uses the lowest score among selected models.
              </p>
              <p className="text-xs text-muted-foreground">
                Maximum selected models: {MODEL_SELECTION_MAX_MODELS}.
              </p>
              <div className="rounded-lg border border-border bg-background/80 p-3">
                <p className="text-xs font-medium text-foreground">Add custom model</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Paste any Transformers.js-compatible model ID (e.g. Xenova/clip-vit-base-patch32).
                </p>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    value={customModelId}
                    onChange={(event) => {
                      setCustomModelId(event.currentTarget.value)
                      if (customModelError) {
                        setCustomModelError(null)
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault()
                        addCustomModel()
                      }
                    }}
                    placeholder="Xenova/your-model-id"
                    className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addCustomModel}
                    className="sm:w-auto"
                  >
                    Add model
                  </Button>
                </div>
                {customModelError ? (
                  <p className="mt-2 text-xs text-destructive">{customModelError}</p>
                ) : null}
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {selectableModelEntries.map((entry) => {
                  const checked = selectedModelIds.includes(entry.id)
                  const isLoaded = loadedModelIds.includes(entry.id)
                  const runtimeStatus =
                    modelRuntimeStatuses[entry.id] ??
                    ({
                      modelId: entry.id,
                      phase: isLoaded ? "ready" : "idle",
                      sizeBytes: null,
                      sizeSource: "unknown",
                      error: null,
                      updatedAt: 0,
                    } satisfies ModelRuntimeStatus)
                  const progress = modelDownloadProgress[entry.id]
                  return (
                    <label
                      key={entry.id}
                      className={`flex cursor-pointer flex-col gap-2 rounded-lg border p-3 transition-colors ${
                        checked
                          ? "border-primary/50 bg-primary/5"
                          : "border-border bg-background/80"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            className="mt-1 accent-primary"
                            checked={checked}
                            onChange={(event) =>
                              toggleModel(entry.id, event.currentTarget.checked)
                            }
                          />
                          <div>
                            <p className="text-sm font-medium text-foreground">{entry.label}</p>
                            <p className="text-xs text-muted-foreground">{entry.notes}</p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge
                            variant="outline"
                            className={modelPhaseBadgeClass(runtimeStatus.phase)}
                          >
                            {runtimeStatus.phase}
                          </Badge>
                          <Badge variant="outline" className="border-border text-muted-foreground">
                            {formatBytes(runtimeStatus.sizeBytes)}
                          </Badge>
                        </div>
                      </div>
                      {runtimeStatus.error ? (
                        <p className="text-xs text-destructive">{runtimeStatus.error}</p>
                      ) : null}
                      {typeof progress?.progress === "number" &&
                      runtimeStatus.phase !== "ready" ? (
                        <p className="text-xs text-muted-foreground">
                          download {progress.progress.toFixed(0)}%
                        </p>
                      ) : null}
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
              <div className="space-y-2 rounded-xl border border-border bg-muted/25 p-4 text-xs">
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Score Formula
                </h3>
                <p className="text-muted-foreground">
                  Hybrid score = ({embeddingWeight.toFixed(2)} x model score) + ({pixelWeight.toFixed(2)} x pixel score)
                </p>
                <p className="text-muted-foreground">
                  Runtime: <span className="text-foreground">{MODEL_CONFIG.runtime}</span> | Aggregation:{" "}
                  <span className="text-foreground">{MODEL_CONFIG.aggregation}</span>
                </p>
                {runtimeInfo ? (
                  <p className="rounded border border-emerald-500/35 bg-emerald-500/10 px-2 py-1 text-emerald-700 dark:text-emerald-300">
                    {runtimeInfo}
                  </p>
                ) : null}
                {failedModelMessages.length ? (
                  <div className="space-y-1 rounded border border-destructive/35 bg-destructive/10 p-2 text-destructive">
                    <p className="font-medium">Model warnings:</p>
                    {failedModelMessages.map((message) => (
                      <p key={message}>{message}</p>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <Button
                  variant="outline"
                  onClick={() => initWorkerModels(selectedModelIds)}
                >
                  Reinitialize models
                </Button>
                <Button variant="outline" onClick={clearRuntimeCache}>
                  Clear runtime cache
                </Button>
                <Button
                  variant="outline"
                  onClick={addCurrentPairToBenchmark}
                  disabled={isComparing || isRunningBenchmark}
                >
                  Add pair to benchmark
                </Button>
                <Button onClick={runCompare} disabled={!canCompare}>
                  {isComparing ? "Comparing..." : "Run compare"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="space-y-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Benchmark Suite
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Run all saved pairs and review quality, speed, and consistency across cases.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4 rounded-xl border border-border bg-muted/25 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    {isRunningBenchmark
                      ? "Benchmark run in progress"
                      : benchmarkStats.total
                        ? "Benchmark summary"
                        : "No benchmark cases yet"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {benchmarkStats.total
                      ? `${benchmarkStats.processedCount} of ${benchmarkStats.total} cases processed.`
                      : "Add source-target pairs to enable benchmark analytics."}
                  </p>
                </div>
                <Badge variant="outline">Threshold {threshold.toFixed(2)}</Badge>
              </div>
              {selectedBenchmarkCase ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/10 px-2 py-1">
                  <p className="text-xs text-foreground">
                    Showing in Results: {selectedBenchmarkCase.label}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedBenchmarkCaseId(null)}
                  >
                    Show live compare
                  </Button>
                </div>
              ) : null}

              <div className="space-y-1">
                <div className="h-2 overflow-hidden rounded-full bg-background">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      isRunningBenchmark ? "bg-amber-500" : "bg-primary"
                    }`}
                    style={{
                      width: `${Math.max(
                        0,
                        Math.min(100, benchmarkStats.progress * 100)
                      )}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Progress: {(benchmarkStats.progress * 100).toFixed(0)}%
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">
                    View: {selectedBenchmarkCase ? "Pinned case" : "Live compare"}
                  </Badge>
                  <Badge
                    className={
                      isRunningBenchmark
                        ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200"
                        : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    }
                  >
                    {isRunningBenchmark ? "Run active" : "Run idle"}
                  </Badge>
                  <Badge variant="outline">Scored: {benchmarkStats.finished}</Badge>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border border-border bg-background/80 p-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    Pass rate
                  </p>
                  <p className="text-base font-semibold text-foreground">
                    {(benchmarkStats.passRate * 100).toFixed(1)}%
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {benchmarkStats.passCount} pass / {benchmarkStats.failCount} fail
                  </p>
                </div>

                <div className="rounded-lg border border-border bg-background/80 p-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    Avg hybrid score
                  </p>
                  <p className="text-base font-semibold text-foreground">
                    {benchmarkStats.avgHybrid.toFixed(4)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    range {benchmarkStats.minHybrid.toFixed(4)} {"->"}{" "}
                    {benchmarkStats.maxHybrid.toFixed(4)}
                  </p>
                </div>

                <div className="rounded-lg border border-border bg-background/80 p-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    Avg latency
                  </p>
                  <p className="text-base font-semibold text-foreground">
                    {formatMs(benchmarkStats.avgDuration)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Running: {benchmarkStats.runningCount} | Errors:{" "}
                    {benchmarkStats.errorCount}
                  </p>
                </div>

                <div className="rounded-lg border border-border bg-background/80 p-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    Best / worst case
                  </p>
                  <p className="truncate text-sm font-semibold text-foreground">
                    Best:{" "}
                    {benchmarkStats.bestCase
                      ? `${benchmarkStats.bestCase.result.hybridSimilarity.toFixed(4)} (${benchmarkStats.bestCase.label})`
                      : "-"}
                  </p>
                  <p className="truncate text-sm font-semibold text-foreground">
                    Worst:{" "}
                    {benchmarkStats.worstCase
                      ? `${benchmarkStats.worstCase.result.hybridSimilarity.toFixed(4)} (${benchmarkStats.worstCase.label})`
                      : "-"}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={runBenchmarkSuite}
                disabled={!canRunBenchmark}
              >
                {isRunningBenchmark ? "Running benchmark..." : "Run benchmark suite"}
              </Button>
              <Button variant="outline" asChild>
                <Link
                  href="/analytics"
                  onClick={() => {
                    saveLiveBenchmarkSnapshot(analyticsSnapshotFromCurrentResults)
                    setLatestRunSnapshot(analyticsSnapshotFromCurrentResults)
                  }}
                >
                  Open analytics
                </Link>
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setBenchmarkCases([])
                  setSelectedBenchmarkCaseId(null)
                }}
                disabled={isComparing || isRunningBenchmark || !benchmarkCases.length}
              >
                Clear all cases
              </Button>
            </div>

            {benchmarkCases.length ? (
              <div className="space-y-3">
                {benchmarkCases.map((item, index) => {
                  const predictedOutcome = item.result
                    ? predictedOutcomeFromScore(item.result.hybridSimilarity, threshold)
                    : null
                  const outcomeCorrect =
                    predictedOutcome === null
                      ? null
                      : isCorrectOutcome(item.expectedOutcome, predictedOutcome)

                  return (
                    <div
                    key={item.id}
                    className={`space-y-3 rounded-lg border p-3 transition-colors md:p-4 ${
                      selectedBenchmarkCaseId === item.id
                        ? "border-primary/60 bg-primary/5 ring-1 ring-primary/40"
                        : "border-border bg-muted/20"
                    }`}
                    role="button"
                    tabIndex={0}
                    onClick={() => selectBenchmarkCase(item.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        selectBenchmarkCase(item.id)
                      }
                    }}
                    >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">
                          {index + 1}. {item.label}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.sourceName} {"->"} {item.targetName}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {selectedBenchmarkCaseId === item.id ? (
                          <Badge className="border-primary/40 bg-primary/10 text-primary">
                            showing in results
                          </Badge>
                        ) : null}
                        <Badge variant="outline">
                          expected: {formatOutcome(item.expectedOutcome)}
                        </Badge>
                        <Badge className={benchmarkStatusChipClass(item.status)}>
                          status: {item.status}
                        </Badge>
                        {item.result ? (
                          <Badge
                            className={
                              isPass(item.result.hybridSimilarity, threshold)
                                ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                : "border border-destructive/40 bg-destructive/10 text-destructive"
                            }
                          >
                            verdict:{" "}
                            {isPass(item.result.hybridSimilarity, threshold)
                              ? "PASS"
                              : "FAIL"}
                          </Badge>
                        ) : null}
                        {predictedOutcome ? (
                          <Badge variant="outline">
                            predicted: {formatOutcome(predictedOutcome)}
                          </Badge>
                        ) : null}
                        {outcomeCorrect !== null ? (
                          <Badge
                            className={
                              outcomeCorrect
                                ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                : "border border-destructive/40 bg-destructive/10 text-destructive"
                            }
                          >
                            correctness: {outcomeCorrect ? "correct" : "incorrect"}
                          </Badge>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-[320px_1fr_auto]">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1 rounded-md border border-border bg-background/80 p-2">
                          <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                            Source crop
                          </p>
                          <div className="aspect-video overflow-hidden rounded border border-border bg-background">
                            <Image
                              src={item.sourceDataUrl}
                              alt={`${item.sourceName} crop`}
                              width={320}
                              height={180}
                              unoptimized
                              className="h-full w-full object-contain"
                            />
                          </div>
                        </div>

                        <div className="space-y-1 rounded-md border border-border bg-background/80 p-2">
                          <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                            Target crop
                          </p>
                          <div className="aspect-video overflow-hidden rounded border border-border bg-background">
                            <Image
                              src={item.targetDataUrl}
                              alt={`${item.targetName} crop`}
                              width={320}
                              height={180}
                              unoptimized
                              className="h-full w-full object-contain"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2 text-xs">
                        {item.result ? (
                          <>
                            <div className="grid gap-2 sm:grid-cols-3">
                              <div className="rounded border border-border bg-background/80 px-2 py-2">
                                <p className="uppercase tracking-[0.12em] text-muted-foreground">
                                  Embedding
                                </p>
                                <p className="text-sm font-semibold text-foreground">
                                  {item.result.compute.embeddingSkipped
                                    ? "skipped"
                                    : item.result.embeddingSimilarity.toFixed(4)}
                                </p>
                              </div>
                              <div className="rounded border border-border bg-background/80 px-2 py-2">
                                <p className="uppercase tracking-[0.12em] text-muted-foreground">
                                  Pixel
                                </p>
                                <p className="text-sm font-semibold text-foreground">
                                  {item.result.compute.pixelSkipped
                                    ? "skipped"
                                    : item.result.pixelSimilarity.toFixed(4)}
                                </p>
                              </div>
                              <div className="rounded border border-border bg-background/80 px-2 py-2">
                                <p className="uppercase tracking-[0.12em] text-muted-foreground">
                                  Hybrid
                                </p>
                                <p className="text-sm font-semibold text-foreground">
                                  {item.result.hybridSimilarity.toFixed(4)}
                                </p>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
                              <p>
                                time:{" "}
                                <span className="font-medium text-foreground">
                                  {item.durationMs ? `${item.durationMs} ms` : "-"}
                                </span>
                              </p>
                              <p>
                                worker:{" "}
                                <span className="font-medium text-foreground">
                                  total {item.result.timingsMs.total} ms
                                </span>
                              </p>
                              <p>
                                threshold:{" "}
                                <span className="font-medium text-foreground">
                                  {threshold.toFixed(2)}
                                </span>
                              </p>
                              <p>
                                weights:{" "}
                                <span className="font-medium text-foreground">
                                  model {item.result.usedWeights.embedding.toFixed(2)} / pixel{" "}
                                  {item.result.usedWeights.pixel.toFixed(2)}
                                </span>
                              </p>
                              <p>
                                aggregation:{" "}
                                <span className="font-medium text-foreground">
                                  {item.result.aggregation}
                                </span>
                              </p>
                              <p>
                                cache:{" "}
                                <span className="font-medium text-foreground">
                                  pixel {item.result.cacheStats.pixelCacheHit ? "hit" : "miss"} | embedding {item.result.cacheStats.embeddingHits}/{item.result.cacheStats.embeddingMisses}
                                </span>
                              </p>
                            </div>

                            <div className="space-y-1">
                              <p className="uppercase tracking-[0.12em] text-muted-foreground">
                                Per-model details
                              </p>
                              <div className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
                                {item.result.perModelScores.map((model) => (
                                  <div
                                    key={model.modelId}
                                    className="rounded border border-border bg-background/80 px-2 py-1.5"
                                  >
                                    <p className="font-medium text-foreground">
                                      {modelLabelFromId(model.modelId)}
                                    </p>
                                    <p className="text-muted-foreground">
                                      embedding {model.embeddingSimilarity.toFixed(4)} | hybrid{" "}
                                      {model.hybridSimilarity.toFixed(4)}
                                    </p>
                                    <p className="text-muted-foreground">
                                      predicted{" "}
                                      {formatOutcome(
                                        predictedOutcomeFromScore(
                                          model.hybridSimilarity,
                                          threshold
                                        )
                                      )}{" "}
                                      |{" "}
                                      {isCorrectOutcome(
                                        item.expectedOutcome,
                                        predictedOutcomeFromScore(
                                          model.hybridSimilarity,
                                          threshold
                                        )
                                      )
                                        ? "correct"
                                        : "incorrect"}
                                    </p>
                                    <p className="text-muted-foreground">
                                      latency {model.latencyMs} ms | embedding cache{" "}
                                      {model.embeddingCacheHit ? "hit" : "miss"}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </>
                        ) : (
                          <p className="rounded border border-border bg-background/80 px-3 py-2 text-muted-foreground">
                            {item.status === "running"
                              ? "Comparison is running for this case."
                              : "Run benchmark to see full score breakdown for this case."}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
                        <Select
                          value={item.expectedOutcome}
                          onValueChange={(nextValue) => {
                            if (nextValue === "match" || nextValue === "non-match") {
                              setBenchmarkCaseExpectedOutcome(item.id, nextValue)
                            }
                          }}
                        >
                          <SelectTrigger
                            size="sm"
                            onClick={(event) => event.stopPropagation()}
                            className="min-w-[160px]"
                          >
                            <SelectValue placeholder="Expected outcome" />
                          </SelectTrigger>
                          <SelectContent onClick={(event) => event.stopPropagation()}>
                            <SelectItem value="match">Expected: match</SelectItem>
                            <SelectItem value="non-match">Expected: non-match</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation()
                            selectBenchmarkCase(item.id)
                          }}
                        >
                          View in Results
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation()
                            removeBenchmarkCase(item.id)
                          }}
                          disabled={isRunningBenchmark}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>

                    {item.error ? (
                      <p className="text-xs text-destructive">{item.error}</p>
                    ) : null}
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="rounded-md border border-border bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
                Add current source/target pairs here, then run all to benchmark many image comparisons quickly.
              </p>
            )}
          </CardContent>
        </Card>

        <ResultsPanel
          result={displayedResult}
          threshold={threshold}
          sourceCropUrl={displayedSourceCropUrl}
          targetCropUrl={displayedTargetCropUrl}
          modelStatus={modelStatus}
          modelError={modelError}
          isComparing={isComparing || isRunningBenchmark}
          viewMode={resultsViewMode}
          selectedCaseLabel={selectedBenchmarkCase?.label}
          selectedCaseStatus={selectedBenchmarkCase?.status}
          selectedCaseDurationMs={selectedCaseDurationMs}
        />
      </div>
    </main>
  )
}
