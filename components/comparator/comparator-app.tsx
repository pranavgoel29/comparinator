"use client"

import * as React from "react"
import Image from "next/image"

import { BBoxEditorCanvas } from "@/components/comparator/bbox-editor-canvas"
import { BBoxJsonEditor } from "@/components/comparator/bbox-json-editor"
import { ImageUploadPanel } from "@/components/comparator/image-upload-panel"
import { ResultsPanel } from "@/components/comparator/results-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { createDefaultBBox, isBBoxAtLeastMinPixels } from "@/lib/comparator/bbox"
import { cropImageRegion, fileToImageBitmap, resizeCroppedRegion } from "@/lib/comparator/image"
import {
  MODEL_CATALOG,
  MODEL_CONFIG,
  modelLabelFromId,
} from "@/lib/comparator/model-config"
import { isPass } from "@/lib/comparator/metrics"
import type {
  CompareRequest,
  CompareResult,
  NormalizedBBox,
  WorkerRequest,
  WorkerResponse,
} from "@/lib/comparator/types"

const DEFAULT_THRESHOLD = 0.85
const DEFAULT_MAX_COMPARE_SIDE = 224

type ModelStatus = "idle" | "loading" | "ready" | "error"
type BenchmarkCaseStatus = "idle" | "running" | "done" | "error"

type BenchmarkCase = {
  id: string
  label: string
  sourceName: string
  targetName: string
  sourceDataUrl: string
  targetDataUrl: string
  status: BenchmarkCaseStatus
  result: CompareResult | null
  error: string | null
  durationMs: number | null
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
  return Array.from(new Set(ids))
}

function createBenchmarkCaseId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }

  return `case-${Date.now()}-${Math.round(Math.random() * 100000)}`
}

export function ComparatorApp() {
  const [sourceBitmap, setSourceBitmap] = React.useState<ImageBitmap | null>(null)
  const [targetBitmap, setTargetBitmap] = React.useState<ImageBitmap | null>(null)
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

  const [result, setResult] = React.useState<CompareResult | null>(null)
  const [sourceCropUrl, setSourceCropUrl] = React.useState<string | null>(null)
  const [targetCropUrl, setTargetCropUrl] = React.useState<string | null>(null)

  const [isComparing, setIsComparing] = React.useState(false)
  const [modelStatus, setModelStatus] = React.useState<ModelStatus>("idle")
  const [modelError, setModelError] = React.useState<string | null>(null)
  const [selectedModelIds, setSelectedModelIds] = React.useState<string[]>(
    [...MODEL_CONFIG.defaultModelIds]
  )
  const [loadedModelIds, setLoadedModelIds] = React.useState<string[]>([])
  const [failedModelMessages, setFailedModelMessages] = React.useState<string[]>([])

  const [benchmarkCases, setBenchmarkCases] = React.useState<BenchmarkCase[]>([])
  const [isRunningBenchmark, setIsRunningBenchmark] = React.useState(false)

  const workerRef = React.useRef<Worker | null>(null)
  const sourceBitmapRef = React.useRef<ImageBitmap | null>(null)
  const targetBitmapRef = React.useRef<ImageBitmap | null>(null)
  const pendingCompareRef = React.useRef<{
    resolve: (value: CompareResult) => void
    reject: (error: Error) => void
  } | null>(null)

  const pixelWeight = React.useMemo(
    () => Number((1 - embeddingWeight).toFixed(2)),
    [embeddingWeight]
  )

  const activeModelIds = React.useMemo(() => {
    const base = loadedModelIds.length ? loadedModelIds : selectedModelIds
    return quickMode ? base.slice(0, 1) : base
  }, [loadedModelIds, quickMode, selectedModelIds])

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

  const initWorkerModels = React.useCallback((modelIds: string[]) => {
    if (!workerRef.current) {
      return
    }

    setModelStatus("loading")
    setModelError(null)
    setFailedModelMessages([])

    workerRef.current.postMessage({
      type: "init-model",
      payload: { modelIds },
    } satisfies WorkerRequest)
  }, [])

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

        workerRef.current?.postMessage({
          type: "compare",
          payload,
        } satisfies WorkerRequest)
      })
    },
    []
  )

  React.useEffect(() => {
    const worker = new Worker(
      new URL("../../workers/embedding.worker.ts", import.meta.url),
      { type: "module" }
    )

    workerRef.current = worker

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data

      if (message.type === "model-ready") {
        setLoadedModelIds(message.payload.loadedModelIds)
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

    initWorkerModels([...MODEL_CONFIG.defaultModelIds])

    return () => {
      if (pendingCompareRef.current) {
        pendingCompareRef.current.reject(new Error("Worker terminated."))
        pendingCompareRef.current = null
      }

      worker.terminate()
      workerRef.current = null
    }
  }, [initWorkerModels])

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

    if (!activeModelIds.length) {
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
      sourceDataUrl: sourceRegion.dataUrl,
      targetDataUrl: targetRegion.dataUrl,
      modelIds: activeModelIds,
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
    maxCompareSide,
    minAreaPixels,
    pixelWeight,
    sourceBBox,
    sourceBitmap,
    targetBBox,
    targetBitmap,
  ])

  const runCompare = React.useCallback(async () => {
    if (modelStatus !== "ready") {
      setModelError("Models are still loading. Wait for ready status.")
      return
    }

    try {
      const { sourceRegion, targetRegion, request } =
        buildCompareRequestFromActivePair()

      setSourceCropUrl(sourceRegion.dataUrl)
      setTargetCropUrl(targetRegion.dataUrl)
      setIsComparing(true)
      setModelError(null)

      const nextResult = await executeCompare(request)
      setResult(nextResult)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Comparison failed unexpectedly."
      setModelError(message)
    } finally {
      setIsComparing(false)
    }
  }, [buildCompareRequestFromActivePair, executeCompare, modelStatus])

  const toggleModel = React.useCallback(
    (modelId: string, checked: boolean) => {
      const next = checked
        ? unique([...selectedModelIds, modelId])
        : selectedModelIds.filter((id) => id !== modelId)

      if (!next.length) {
        setModelError("Select at least one model.")
        return
      }

      setSelectedModelIds(next)
      initWorkerModels(next)
    },
    [initWorkerModels, selectedModelIds]
  )

  const addCurrentPairToBenchmark = React.useCallback(() => {
    try {
      const { sourceRegion, targetRegion } = buildCompareRequestFromActivePair()

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
        status: "idle",
        result: null,
        error: null,
        durationMs: null,
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

    if (!activeModelIds.length) {
      setModelError("No initialized models available for benchmark.")
      return
    }

    setIsRunningBenchmark(true)
    setModelError(null)

    const casesSnapshot = [...benchmarkCases]

    for (const item of casesSnapshot) {
      setBenchmarkCases((previous) =>
        previous.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                status: "running",
                error: null,
              }
            : entry
        )
      )

      const started = performance.now()

      try {
        const nextResult = await executeCompare({
          sourceDataUrl: item.sourceDataUrl,
          targetDataUrl: item.targetDataUrl,
          modelIds: activeModelIds,
          weights: {
            embedding: embeddingWeight,
            pixel: pixelWeight,
          },
        })

        const durationMs = Math.round(performance.now() - started)

        setBenchmarkCases((previous) =>
          previous.map((entry) =>
            entry.id === item.id
              ? {
                  ...entry,
                  status: "done",
                  result: nextResult,
                  durationMs,
                }
              : entry
          )
        )

        setResult(nextResult)
        setSourceCropUrl(item.sourceDataUrl)
        setTargetCropUrl(item.targetDataUrl)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Benchmark compare failed."

        setBenchmarkCases((previous) =>
          previous.map((entry) =>
            entry.id === item.id
              ? {
                  ...entry,
                  status: "error",
                  error: message,
                }
              : entry
          )
        )
      }
    }

    setIsRunningBenchmark(false)
  }, [
    activeModelIds,
    benchmarkCases,
    embeddingWeight,
    executeCompare,
    pixelWeight,
  ])

  const removeBenchmarkCase = React.useCallback((id: string) => {
    setBenchmarkCases((previous) => previous.filter((entry) => entry.id !== id))
  }, [])

  const canCompare =
    modelStatus === "ready" &&
    !isComparing &&
    !isRunningBenchmark &&
    activeModelIds.length > 0 &&
    Boolean(sourceBitmap && targetBitmap && sourceBBox && targetBBox)

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

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Source: {readinessLabel(Boolean(sourceBitmap))}</Badge>
              <Badge variant="outline">Target: {readinessLabel(Boolean(targetBitmap))}</Badge>
              <Badge variant="outline">
                Active models: {activeModelIds.length}
              </Badge>
              <Badge className={statusChipClass(modelStatus)}>Engine: {modelStatus}</Badge>
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
                      setMaxCompareSide(Number(event.currentTarget.value))
                    }
                    className="w-full accent-primary"
                  />
                </div>

                <label className="flex items-start gap-2 rounded-lg border border-border bg-background/80 p-3 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={quickMode}
                    onChange={(event) => setQuickMode(event.currentTarget.checked)}
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
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {MODEL_CATALOG.map((entry) => {
                  const checked = selectedModelIds.includes(entry.id)
                  const isLoaded = loadedModelIds.includes(entry.id)
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
                        <Badge
                          variant="outline"
                          className={
                            isLoaded
                              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              : "border-border text-muted-foreground"
                          }
                        >
                          {isLoaded ? "loaded" : "idle"}
                        </Badge>
                      </div>
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

                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">Cases: {benchmarkStats.total}</Badge>
                  <Badge variant="outline">
                    Processed: {benchmarkStats.processedCount}
                  </Badge>
                  <Badge variant="outline">
                    Scored: {benchmarkStats.finished}
                  </Badge>
                  <Badge variant="outline">
                    Threshold: {threshold.toFixed(2)}
                  </Badge>
                  <Badge
                    className={
                      isRunningBenchmark
                        ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200"
                        : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    }
                  >
                    {isRunningBenchmark ? "Run state: active" : "Run state: idle"}
                  </Badge>
                </div>
              </div>

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
                disabled={isComparing || isRunningBenchmark || !benchmarkCases.length}
              >
                {isRunningBenchmark ? "Running benchmark..." : "Run benchmark suite"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setBenchmarkCases([])}
                disabled={isComparing || isRunningBenchmark || !benchmarkCases.length}
              >
                Clear all cases
              </Button>
            </div>

            {benchmarkCases.length ? (
              <div className="space-y-3">
                {benchmarkCases.map((item, index) => (
                  <div
                    key={item.id}
                    className="space-y-3 rounded-lg border border-border bg-muted/20 p-3 md:p-4"
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
                                  {item.result.embeddingSimilarity.toFixed(4)}
                                </p>
                              </div>
                              <div className="rounded border border-border bg-background/80 px-2 py-2">
                                <p className="uppercase tracking-[0.12em] text-muted-foreground">
                                  Pixel
                                </p>
                                <p className="text-sm font-semibold text-foreground">
                                  {item.result.pixelSimilarity.toFixed(4)}
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

                      <div className="flex justify-start lg:justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => removeBenchmarkCase(item.id)}
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
                ))}
              </div>
            ) : (
              <p className="rounded-md border border-border bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
                Add current source/target pairs here, then run all to benchmark many image comparisons quickly.
              </p>
            )}
          </CardContent>
        </Card>

        <ResultsPanel
          result={result}
          threshold={threshold}
          sourceCropUrl={sourceCropUrl}
          targetCropUrl={targetCropUrl}
          modelStatus={modelStatus}
          modelError={modelError}
          isComparing={isComparing || isRunningBenchmark}
        />
      </div>
    </main>
  )
}
