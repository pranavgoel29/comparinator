"use client"

import * as React from "react"

import { BBoxEditorCanvas } from "@/components/comparator/bbox-editor-canvas"
import { BBoxJsonEditor } from "@/components/comparator/bbox-json-editor"
import { BenchmarkCasesList } from "@/components/comparator/benchmark-cases-list"
import { BenchmarkSummaryCard } from "@/components/comparator/benchmark-summary-card"
import { ComparatorControlCenter } from "@/components/comparator/comparator-control-center"
import { readinessLabel, statusChipClass } from "@/components/comparator/comparator-formatters"
import { DEFAULT_EXPECTED_OUTCOME, DEFAULT_MAX_COMPARE_SIDE, DEFAULT_THRESHOLD, PRESET_COMPARE_SIZE, PRESET_MODEL_IDS, PRESET_QUICK_MODE, type BenchmarkCase, type BenchmarkPreset } from "@/components/comparator/comparator-types"
import { ImageUploadPanel } from "@/components/comparator/image-upload-panel"
import { ModelStatusDialog } from "@/components/comparator/model-status-dialog"
import { ResultsPanel } from "@/components/comparator/results-panel"
import { useBenchmarkSuite } from "@/components/comparator/use-benchmark-suite"
import { useComparatorSession } from "@/components/comparator/use-comparator-session"
import { useComparatorWorker } from "@/components/comparator/use-comparator-worker"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardHeader } from "@/components/ui/card"
import { buildBenchmarkRunSnapshot } from "@/lib/comparator/benchmark-analytics"
import { createDefaultBBox, isBBoxAtLeastMinPixels } from "@/lib/comparator/bbox"
import { cropImageRegion, fileToImageBitmap, resizeCroppedRegion } from "@/lib/comparator/image"
import { MODEL_SELECTION_MAX_MODELS, normalizeModelId, normalizeUniqueModelIds, validateModelId, validateModelSelectionCount } from "@/lib/comparator/model-id"
import { MODEL_CATALOG, MODEL_CONFIG } from "@/lib/comparator/model-config"
import { saveLiveBenchmarkSnapshot } from "@/lib/comparator/live-snapshot"
import type { BenchmarkRunSnapshot, CompareRequest, CompareResult, NormalizedBBox } from "@/lib/comparator/types"

function unique(ids: string[]) {
  return normalizeUniqueModelIds(ids)
}

function createComparatorWorker() {
  return new Worker(new URL("../../workers/embedding.worker.ts", import.meta.url), { type: "module" })
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
  const [sourceLockAreaOnUpload, setSourceLockAreaOnUpload] = React.useState(false)
  const [targetLockAreaOnUpload, setTargetLockAreaOnUpload] = React.useState(false)

  const [threshold, setThreshold] = React.useState(DEFAULT_THRESHOLD)
  const [embeddingWeight, setEmbeddingWeight] = React.useState<number>(MODEL_CONFIG.hybridWeights.embedding)
  const [minAreaPixels, setMinAreaPixels] = React.useState<number>(MODEL_CONFIG.minRoiPixels)
  const [maxCompareSide, setMaxCompareSide] = React.useState<number>(DEFAULT_MAX_COMPARE_SIDE)
  const [quickMode, setQuickMode] = React.useState(false)
  const [selectedPreset, setSelectedPreset] = React.useState<BenchmarkPreset>("custom")
  const [lastNonCustomPreset, setLastNonCustomPreset] = React.useState<Exclude<BenchmarkPreset, "custom"> | null>(null)

  const [result, setResult] = React.useState<CompareResult | null>(null)
  const [sourceCropUrl, setSourceCropUrl] = React.useState<string | null>(null)
  const [targetCropUrl, setTargetCropUrl] = React.useState<string | null>(null)
  const [selectedBenchmarkCaseId, setSelectedBenchmarkCaseId] = React.useState<string | null>(null)
  const [runtimeInfo, setRuntimeInfo] = React.useState<string | null>(null)
  const [latestRunSnapshot, setLatestRunSnapshot] = React.useState<BenchmarkRunSnapshot | null>(null)

  const [isComparing, setIsComparing] = React.useState(false)
  const [benchmarkCases, setBenchmarkCases] = React.useState<BenchmarkCase[]>([])
  const [selectedModelIds, setSelectedModelIds] = React.useState<string[]>([...MODEL_CONFIG.defaultModelIds])
  const [customModelId, setCustomModelId] = React.useState("")
  const [customModelError, setCustomModelError] = React.useState<string | null>(null)
  const [isModelStatusDialogOpen, setIsModelStatusDialogOpen] = React.useState(false)

  const sourceBitmapRef = React.useRef<ImageBitmap | null>(null)
  const targetBitmapRef = React.useRef<ImageBitmap | null>(null)
  const applyingPresetRef = React.useRef(false)

  const pixelWeight = React.useMemo(() => Number((1 - embeddingWeight).toFixed(2)), [embeddingWeight])
  const embeddingRequired = embeddingWeight > 0

  const {
    workerMounted,
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
  } = useComparatorWorker({ setIsComparing, setRuntimeInfo })

  const activeModelIds = React.useMemo(() => {
    const base = unique(loadedModelIds.length ? loadedModelIds : selectedModelIds)
    return quickMode ? base.slice(0, 1) : base
  }, [loadedModelIds, quickMode, selectedModelIds])

  const selectableModelEntries = React.useMemo(() => {
    const catalogIds = new Set(MODEL_CATALOG.map((entry) => entry.id))
    const customSelectedEntries = selectedModelIds
      .filter((modelId) => !catalogIds.has(modelId))
      .map((modelId) => ({
        id: modelId,
        label: modelId,
        notes: "Custom model ID. Must support Transformers.js image-feature-extraction.",
      }))
    return [...MODEL_CATALOG, ...customSelectedEntries]
  }, [selectedModelIds])

  const selectedBenchmarkCase = React.useMemo(() => {
    if (!selectedBenchmarkCaseId) return null
    return benchmarkCases.find((item) => item.id === selectedBenchmarkCaseId) ?? null
  }, [benchmarkCases, selectedBenchmarkCaseId])

  const modelStatusRows = React.useMemo(() => {
    return unique(selectedModelIds).map((modelId) => {
      const status = modelRuntimeStatuses[modelId]
      const progress = modelDownloadProgress[modelId]
      return {
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
    })
  }, [modelDownloadProgress, modelRuntimeStatuses, selectedModelIds])

  const {
    isRunningBenchmark,
    benchmarkStats,
    runBenchmarkSuite,
    addCase,
    removeCase,
    selectCase,
    setCaseExpectedOutcome,
    clearCases,
    benchmarkPoolRef,
  } = useBenchmarkSuite({
    benchmarkCases,
    selectedModelIds,
    embeddingRequired,
    modelStatus,
    embeddingWeight,
    pixelWeight,
    threshold,
    createWorker: createComparatorWorker,
    setBenchmarkCases,
    setSelectedBenchmarkCaseId,
    setResult,
    setSourceCropUrl,
    setTargetCropUrl,
    setLatestRunSnapshot,
    setRuntimeInfo,
    setModelError,
  })

  const { clearSavedSession } = useComparatorSession({
    workerMounted,
    initWorkerModels,
    sourceImageBlob,
    targetImageBlob,
    sourceFileName,
    targetFileName,
    sourceBBox,
    targetBBox,
    sourceLockAreaOnUpload,
    targetLockAreaOnUpload,
    threshold,
    embeddingWeight,
    minAreaPixels,
    maxCompareSide,
    quickMode,
    selectedPreset,
    lastNonCustomPreset,
    selectedModelIds,
    benchmarkCases,
    selectedBenchmarkCaseId,
    latestRunSnapshot,
    isRunningBenchmark,
    setSourceBitmap,
    setTargetBitmap,
    setSourceImageBlob,
    setTargetImageBlob,
    setSourceFileName,
    setTargetFileName,
    setSourceBBox,
    setTargetBBox,
    setSourceLockAreaOnUpload,
    setTargetLockAreaOnUpload,
    setThreshold,
    setEmbeddingWeight,
    setMinAreaPixels,
    setMaxCompareSide,
    setQuickMode,
    setSelectedPreset,
    setLastNonCustomPreset,
    setSelectedModelIds,
    setBenchmarkCases,
    setSelectedBenchmarkCaseId,
    setLatestRunSnapshot,
    setResult,
    setSourceCropUrl,
    setTargetCropUrl,
    setRuntimeInfo,
    setModelError,
  })

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

  const markPresetAsCustom = React.useCallback(() => {
    if (applyingPresetRef.current) return
    setSelectedPreset((previous) => (previous === "custom" ? previous : "custom"))
  }, [])

  const applyPreset = React.useCallback((preset: Exclude<BenchmarkPreset, "custom">) => {
    const modelIds = unique(PRESET_MODEL_IDS[preset])
    applyingPresetRef.current = true
    setSelectedPreset(preset)
    setLastNonCustomPreset(preset)
    setSelectedModelIds(modelIds)
    setQuickMode(PRESET_QUICK_MODE[preset])
    setMaxCompareSide(PRESET_COMPARE_SIZE[preset])
    setRuntimeInfo(`${preset} preset applied.`)
    initWorkerModels(modelIds)
    applyingPresetRef.current = false
  }, [initWorkerModels])

  const uploadImage = React.useCallback(async (kind: "source" | "target", file: File) => {
    try {
      const bitmap = await fileToImageBitmap(file)
      if (kind === "source") {
        setSourceBitmap((previous) => {
          previous?.close()
          return bitmap
        })
        setSourceImageBlob(file)
        setSourceFileName(file.name)
        setSourceBBox(sourceLockAreaOnUpload && sourceBBox ? sourceBBox : createDefaultBBox())
      } else {
        setTargetBitmap((previous) => {
          previous?.close()
          return bitmap
        })
        setTargetImageBlob(file)
        setTargetFileName(file.name)
        setTargetBBox(targetLockAreaOnUpload && targetBBox ? targetBBox : createDefaultBBox())
      }
      setResult(null)
      setSourceCropUrl(null)
      setTargetCropUrl(null)
      setSelectedBenchmarkCaseId(null)
      setModelError(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not parse image."
      setModelError(message)
    }
  }, [setModelError, sourceBBox, sourceLockAreaOnUpload, targetBBox, targetLockAreaOnUpload])

  const buildCompareRequestFromActivePair = React.useCallback(() => {
    if (!sourceBitmap || !targetBitmap || !sourceBBox || !targetBBox) {
      throw new Error("Upload both images and set a selected area in each image.")
    }
    if (!isBBoxAtLeastMinPixels(sourceBBox, { width: sourceBitmap.width, height: sourceBitmap.height }, minAreaPixels)) {
      throw new Error(`Source selected area must be at least ${minAreaPixels}x${minAreaPixels} pixels.`)
    }
    if (!isBBoxAtLeastMinPixels(targetBBox, { width: targetBitmap.width, height: targetBitmap.height }, minAreaPixels)) {
      throw new Error(`Target selected area must be at least ${minAreaPixels}x${minAreaPixels} pixels.`)
    }
    if (embeddingRequired && !activeModelIds.length) {
      throw new Error("No initialized models available for compare.")
    }

    const sourceRegion = resizeCroppedRegion(cropImageRegion(sourceBitmap, sourceBBox), maxCompareSide)
    const targetRegion = resizeCroppedRegion(cropImageRegion(targetBitmap, targetBBox), maxCompareSide)

    const request: CompareRequest = {
      source: { width: sourceRegion.width, height: sourceRegion.height, rgba: new Uint8ClampedArray(sourceRegion.imageData.data) },
      target: { width: targetRegion.width, height: targetRegion.height, rgba: new Uint8ClampedArray(targetRegion.imageData.data) },
      modelIds: embeddingRequired ? activeModelIds : [],
      weights: { embedding: embeddingWeight, pixel: pixelWeight },
    }

    return { sourceRegion, targetRegion, request }
  }, [activeModelIds, embeddingRequired, embeddingWeight, maxCompareSide, minAreaPixels, pixelWeight, sourceBBox, sourceBitmap, targetBBox, targetBitmap])

  const runCompare = React.useCallback(async () => {
    if (embeddingRequired && modelStatus !== "ready") {
      setModelError("Models are still loading. Wait for ready status.")
      return
    }
    try {
      const { sourceRegion, targetRegion, request } = buildCompareRequestFromActivePair()
      setSelectedBenchmarkCaseId(null)
      setSourceCropUrl(sourceRegion.dataUrl)
      setTargetCropUrl(targetRegion.dataUrl)
      setIsComparing(true)
      setModelError(null)
      setRuntimeInfo(null)
      const nextResult = await executeCompare(request)
      setResult(nextResult)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Comparison failed unexpectedly."
      setModelError(message)
    } finally {
      setIsComparing(false)
    }
  }, [buildCompareRequestFromActivePair, embeddingRequired, executeCompare, modelStatus, setModelError])

  const toggleModel = React.useCallback((modelId: string, checked: boolean) => {
    const normalizedModelId = normalizeModelId(modelId)
    const next = checked ? unique([...selectedModelIds, normalizedModelId]) : selectedModelIds.filter((id) => id !== normalizedModelId)
    if (!next.length) {
      setModelError("Select at least one model.")
      return
    }
    if (!validateModelSelectionCount(next)) {
      setModelError(`Select at most ${MODEL_SELECTION_MAX_MODELS} models.`)
      return
    }
    const invalidModel = next.find((entry) => Boolean(validateModelId(entry)))
    if (invalidModel) {
      setModelError(validateModelId(invalidModel) ?? "Invalid model id")
      return
    }
    markPresetAsCustom()
    setSelectedModelIds(next)
    initWorkerModels(next)
  }, [initWorkerModels, markPresetAsCustom, selectedModelIds, setModelError])

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
      setCustomModelError(`Select at most ${MODEL_SELECTION_MAX_MODELS} models.`)
      return
    }
    markPresetAsCustom()
    setSelectedModelIds(next)
    setCustomModelId("")
    setCustomModelError(null)
    setModelError(null)
    initWorkerModels(next)
  }, [customModelId, initWorkerModels, markPresetAsCustom, selectedModelIds, setModelError])

  const addCurrentPairToBenchmark = React.useCallback(() => {
    try {
      const { sourceRegion, targetRegion, request } = buildCompareRequestFromActivePair()
      const sourceName = sourceFileName || "source-image"
      const targetName = targetFileName || "target-image"
      addCase({
        label: `${sourceName} vs ${targetName}`,
        sourceName,
        targetName,
        sourceDataUrl: sourceRegion.dataUrl,
        targetDataUrl: targetRegion.dataUrl,
        sourcePayload: { width: request.source.width, height: request.source.height, rgba: new Uint8ClampedArray(request.source.rgba) },
        targetPayload: { width: request.target.width, height: request.target.height, rgba: new Uint8ClampedArray(request.target.rgba) },
        expectedOutcome: DEFAULT_EXPECTED_OUTCOME,
      })
      setModelError(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not add benchmark case."
      setModelError(message)
    }
  }, [addCase, buildCompareRequestFromActivePair, sourceFileName, targetFileName, setModelError])

  const canCompare = (!embeddingRequired || modelStatus === "ready") && !isComparing && !isRunningBenchmark && (!embeddingRequired || activeModelIds.length > 0) && Boolean(sourceBitmap && targetBitmap && sourceBBox && targetBBox)
  const canRunBenchmark = !isComparing && !isRunningBenchmark && benchmarkCases.length > 0 && (!embeddingRequired || (modelStatus === "ready" && activeModelIds.length > 0))

  const sourceDimensions = sourceBitmap ? { width: sourceBitmap.width, height: sourceBitmap.height } : null
  const targetDimensions = targetBitmap ? { width: targetBitmap.width, height: targetBitmap.height } : null
  const displayedResult = selectedBenchmarkCase?.result ?? result
  const displayedSourceCropUrl = selectedBenchmarkCase?.sourceDataUrl ?? sourceCropUrl
  const displayedTargetCropUrl = selectedBenchmarkCase?.targetDataUrl ?? targetCropUrl
  const resultsViewMode: "benchmark" | "live" = selectedBenchmarkCase ? "benchmark" : "live"
  const selectedCaseDurationMs = selectedBenchmarkCase?.result?.timingsMs.total ?? selectedBenchmarkCase?.durationMs ?? null

  const benchmarkSnapshotFromCurrentResults = React.useMemo(() => {
    const hasAnyProcessed = benchmarkCases.some((item) => item.status === "done" || item.status === "error")
    if (!hasAnyProcessed) return latestRunSnapshot
    const modelIdsFromResults = unique(benchmarkCases.flatMap((item) => item.result ? item.result.perModelScores.map((model) => model.modelId) : []))
    const modelIdsForSnapshot = unique([...selectedModelIds, ...modelIdsFromResults])
    return buildBenchmarkRunSnapshot({
      cases: benchmarkCases,
      threshold,
      weights: { embedding: embeddingWeight, pixel: pixelWeight },
      modelIds: modelIdsForSnapshot,
    })
  }, [benchmarkCases, embeddingWeight, latestRunSnapshot, pixelWeight, selectedModelIds, threshold])

  React.useEffect(() => {
    saveLiveBenchmarkSnapshot(benchmarkSnapshotFromCurrentResults)
  }, [benchmarkSnapshotFromCurrentResults])

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
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
                <Badge variant="outline">Active models: {activeModelIds.length}</Badge>
                <Badge className={statusChipClass(modelStatus)}>Engine: {modelStatus}</Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ModelStatusDialog open={isModelStatusDialogOpen} onOpenChange={setIsModelStatusDialogOpen} rows={modelStatusRows} />
                <Button variant="outline" size="sm" onClick={clearSavedSession} disabled={isComparing || isRunningBenchmark}>
                  Clear saved session
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <div className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm">
            <ImageUploadPanel title="Source Reference" subtitle="Upload source image and mark the area to compare" fileName={sourceFileName} dimensions={sourceDimensions} onSelect={(file) => uploadImage("source", file)}>
              <BBoxJsonEditor title="Source Area" bbox={sourceBBox} dimensions={sourceDimensions} onApply={setSourceBBox} lockOnUpload={sourceLockAreaOnUpload} onLockOnUploadChange={setSourceLockAreaOnUpload} />
            </ImageUploadPanel>
            <BBoxEditorCanvas image={sourceBitmap} bbox={sourceBBox} onChange={setSourceBBox} editable label="Source Area" minPixels={minAreaPixels} />
          </div>
          <div className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm">
            <ImageUploadPanel title="Target Candidate" subtitle="Upload target image and mark the matching area" fileName={targetFileName} dimensions={targetDimensions} onSelect={(file) => uploadImage("target", file)}>
              <BBoxJsonEditor title="Target Area" bbox={targetBBox} dimensions={targetDimensions} onApply={setTargetBBox} lockOnUpload={targetLockAreaOnUpload} onLockOnUploadChange={setTargetLockAreaOnUpload} />
            </ImageUploadPanel>
            <BBoxEditorCanvas image={targetBitmap} bbox={targetBBox} editable onChange={setTargetBBox} label="Target Area" minPixels={minAreaPixels} />
          </div>
        </section>

        <ComparatorControlCenter
          selectedPreset={selectedPreset}
          lastNonCustomPreset={lastNonCustomPreset}
          threshold={threshold}
          embeddingWeight={embeddingWeight}
          pixelWeight={pixelWeight}
          minAreaPixels={minAreaPixels}
          maxCompareSide={maxCompareSide}
          quickMode={quickMode}
          selectedModelIds={selectedModelIds}
          customModelId={customModelId}
          customModelError={customModelError}
          selectableModelEntries={selectableModelEntries}
          loadedModelIds={loadedModelIds}
          modelRuntimeStatuses={modelRuntimeStatuses}
          modelDownloadProgress={modelDownloadProgress}
          runtimeInfo={runtimeInfo}
          failedModelMessages={failedModelMessages}
          canCompare={canCompare}
          isComparing={isComparing}
          isRunningBenchmark={isRunningBenchmark}
          onApplyPreset={applyPreset}
          onThresholdChange={setThreshold}
          onEmbeddingWeightChange={setEmbeddingWeight}
          onMinAreaPixelsChange={setMinAreaPixels}
          onMaxCompareSideChange={(nextValue) => {
            setMaxCompareSide(nextValue)
            markPresetAsCustom()
          }}
          onQuickModeChange={(nextValue) => {
            setQuickMode(nextValue)
            markPresetAsCustom()
          }}
          onCustomModelIdChange={setCustomModelId}
          onToggleModel={toggleModel}
          onAddCustomModel={addCustomModel}
          onClearCustomModelError={() => setCustomModelError(null)}
          onInitWorkerModels={() => initWorkerModels(selectedModelIds)}
          onClearRuntimeCache={() => clearRuntimeCache(benchmarkPoolRef.current)}
          onAddCurrentPairToBenchmark={addCurrentPairToBenchmark}
          onRunCompare={runCompare}
        />

        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="space-y-2">
            <p className="text-sm text-muted-foreground">Run all saved pairs and review quality, speed, and consistency across cases.</p>
          </CardHeader>
          <div className="space-y-4 p-6 pt-0">
            <BenchmarkSummaryCard
              stats={benchmarkStats}
              threshold={threshold}
              isRunningBenchmark={isRunningBenchmark}
              selectedBenchmarkCase={selectedBenchmarkCase}
              canRunBenchmark={canRunBenchmark}
              isComparing={isComparing}
              hasCases={benchmarkCases.length > 0}
              onRunBenchmarkSuite={runBenchmarkSuite}
              onOpenAnalytics={() => {
                saveLiveBenchmarkSnapshot(benchmarkSnapshotFromCurrentResults)
                setLatestRunSnapshot(benchmarkSnapshotFromCurrentResults)
                globalThis.location.href = "/analytics"
              }}
              onClearCases={clearCases}
              onShowLiveCompare={() => setSelectedBenchmarkCaseId(null)}
            />

            <BenchmarkCasesList
              benchmarkCases={benchmarkCases}
              selectedBenchmarkCaseId={selectedBenchmarkCaseId}
              threshold={threshold}
              isRunningBenchmark={isRunningBenchmark}
              onSelectBenchmarkCase={(id) => selectCase(id)}
              onSetExpectedOutcome={setCaseExpectedOutcome}
              onRemoveBenchmarkCase={removeCase}
            />
          </div>
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
