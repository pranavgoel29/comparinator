"use client"

import * as React from "react"

import { BBoxEditorCanvas } from "@/components/comparator/bbox-editor-canvas"
import { BBoxJsonEditor } from "@/components/comparator/bbox-json-editor"
import { ImageUploadPanel } from "@/components/comparator/image-upload-panel"
import { ResultsPanel } from "@/components/comparator/results-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { createDefaultBBox, isBBoxAtLeastMinPixels } from "@/lib/comparator/bbox"
import { cropImageRegion, fileToImageBitmap } from "@/lib/comparator/image"
import {
  MODEL_CATALOG,
  MODEL_CONFIG,
  modelLabelFromId,
} from "@/lib/comparator/model-config"
import type {
  CompareResult,
  NormalizedBBox,
  WorkerRequest,
  WorkerResponse,
} from "@/lib/comparator/types"

const DEFAULT_THRESHOLD = 0.85

type ModelStatus = "idle" | "loading" | "ready" | "error"

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

function unique(ids: string[]) {
  return Array.from(new Set(ids))
}

export function ComparatorApp() {
  const [sourceBitmap, setSourceBitmap] = React.useState<ImageBitmap | null>(null)
  const [targetBitmap, setTargetBitmap] = React.useState<ImageBitmap | null>(null)
  const [sourceFileName, setSourceFileName] = React.useState<string>()
  const [targetFileName, setTargetFileName] = React.useState<string>()
  const [sourceBBox, setSourceBBox] = React.useState<NormalizedBBox | null>(null)
  const [targetBBox, setTargetBBox] = React.useState<NormalizedBBox | null>(null)
  const [threshold, setThreshold] = React.useState(DEFAULT_THRESHOLD)
  const [embeddingWeight, setEmbeddingWeight] = React.useState<number>(
    MODEL_CONFIG.hybridWeights.embedding
  )
  const [minRoiPixels, setMinRoiPixels] = React.useState<number>(
    MODEL_CONFIG.minRoiPixels
  )

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

  const workerRef = React.useRef<Worker | null>(null)
  const sourceBitmapRef = React.useRef<ImageBitmap | null>(null)
  const targetBitmapRef = React.useRef<ImageBitmap | null>(null)
  const pixelWeight = React.useMemo(
    () => Number((1 - embeddingWeight).toFixed(2)),
    [embeddingWeight]
  )

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
        setResult(message.payload)
        setIsComparing(false)
        setModelError(null)
        return
      }

      if (message.type === "error") {
        setModelStatus((prev) => (prev === "loading" ? "error" : prev))
        setModelError(message.message)
        setIsComparing(false)
      }
    }

    worker.onerror = (event) => {
      setModelStatus("error")
      setModelError(event.message || "Worker crashed unexpectedly.")
      setIsComparing(false)
    }

    initWorkerModels([...MODEL_CONFIG.defaultModelIds])

    return () => {
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
          setSourceBBox(createDefaultBBox())
        } else {
          setTargetBitmap((previous) => {
            previous?.close()
            return bitmap
          })
          setTargetFileName(file.name)
          setTargetBBox(createDefaultBBox())
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
    []
  )

  const runCompare = React.useCallback(() => {
    if (!workerRef.current) {
      setModelError("Worker is not ready yet.")
      return
    }

    if (modelStatus !== "ready") {
      setModelError("Model is still loading. Wait for ready status.")
      return
    }

    if (!sourceBitmap || !targetBitmap || !sourceBBox || !targetBBox) {
      setModelError("Upload both images and set a selected area in each image.")
      return
    }

    if (
      !isBBoxAtLeastMinPixels(
        sourceBBox,
        {
          width: sourceBitmap.width,
          height: sourceBitmap.height,
        },
        minRoiPixels
      )
    ) {
      setModelError(`Source selected area must be at least ${minRoiPixels}x${minRoiPixels} pixels.`)
      return
    }

    if (
      !isBBoxAtLeastMinPixels(
        targetBBox,
        {
          width: targetBitmap.width,
          height: targetBitmap.height,
        },
        minRoiPixels
      )
    ) {
      setModelError(`Target selected area must be at least ${minRoiPixels}x${minRoiPixels} pixels.`)
      return
    }

    const compareModelIds = loadedModelIds.length ? loadedModelIds : selectedModelIds
    if (!compareModelIds.length) {
      setModelError("No initialized models available for compare.")
      return
    }

    const sourceRegion = cropImageRegion(sourceBitmap, sourceBBox)
    const targetRegion = cropImageRegion(targetBitmap, targetBBox)

    setSourceCropUrl(sourceRegion.dataUrl)
    setTargetCropUrl(targetRegion.dataUrl)
    setIsComparing(true)
    setModelError(null)

    workerRef.current.postMessage({
      type: "compare",
      payload: {
        sourceDataUrl: sourceRegion.dataUrl,
        targetDataUrl: targetRegion.dataUrl,
        modelIds: compareModelIds,
        weights: {
          embedding: embeddingWeight,
          pixel: pixelWeight,
        },
      },
    } satisfies WorkerRequest)
  }, [
    embeddingWeight,
    loadedModelIds,
    minRoiPixels,
    modelStatus,
    pixelWeight,
    selectedModelIds,
    sourceBBox,
    sourceBitmap,
    targetBBox,
    targetBitmap,
  ])

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

  const canCompare =
    modelStatus === "ready" &&
    !isComparing &&
    loadedModelIds.length > 0 &&
    Boolean(sourceBitmap && targetBitmap && sourceBBox && targetBBox)

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <Card className="border-border/80 bg-card shadow-sm">
          <CardHeader className="gap-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Inspection Console
              </p>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Image Area Comparator
              </h1>
              <p className="max-w-3xl text-sm text-muted-foreground">
                Pick one area in the source image and one area in the target image, then compare them locally in your browser.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Source: {readinessLabel(Boolean(sourceBitmap))}</Badge>
              <Badge variant="outline">Target: {readinessLabel(Boolean(targetBitmap))}</Badge>
              <Badge variant="outline">
                Models: {loadedModelIds.length}/{selectedModelIds.length} ready
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
              />
            </ImageUploadPanel>
            <BBoxEditorCanvas
              image={sourceBitmap}
              bbox={sourceBBox}
              onChange={setSourceBBox}
              editable
              label="Source Area"
              minPixels={minRoiPixels}
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
              />
            </ImageUploadPanel>
            <BBoxEditorCanvas
              image={targetBitmap}
              bbox={targetBBox}
              editable
              onChange={setTargetBBox}
              label="Target Area"
              minPixels={minRoiPixels}
            />
          </div>
        </section>

        <Card className="border-border bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Compare Controls
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="grid gap-4 lg:grid-cols-5">
              <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3 lg:col-span-1">
                <label className="flex items-center justify-between text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  <span>Pass/Fail cutoff</span>
                  <span className="rounded border border-border bg-background px-2 py-1 font-semibold text-foreground">
                    {threshold.toFixed(2)}
                  </span>
                </label>
                <p className="text-xs text-muted-foreground">
                  Increase this to make PASS harder to get. Lower it to be more lenient.
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

                <input
                  type="number"
                  min={0.5}
                  max={0.99}
                  step={0.01}
                  value={threshold}
                  onChange={(event) => {
                    const parsed = Number(event.target.value)
                    if (!Number.isFinite(parsed)) {
                      return
                    }

                    setThreshold(Math.max(0.5, Math.min(0.99, parsed)))
                  }}
                  className="h-9 w-28 rounded-md border border-border bg-background px-2 text-sm"
                />
              </div>

              <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3 lg:col-span-1">
                <label className="flex items-center justify-between text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  <span>Model weight</span>
                  <span className="rounded border border-border bg-background px-2 py-1 font-semibold text-foreground">
                    {embeddingWeight.toFixed(2)}
                  </span>
                </label>
                <p className="text-xs text-muted-foreground">
                  Controls how much model understanding matters in the final score.
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
                  Pixel weight auto-updates to <span className="font-semibold text-foreground">{pixelWeight.toFixed(2)}</span>. Increase model weight if the same object looks different due to lighting/angle. Decrease it if different objects have similar texture.
                </p>
                <p className="text-xs text-muted-foreground">
                  `0.00` = pixel-only check. `1.00` = model-only check.
                </p>
              </div>

              <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3 lg:col-span-1">
                <label className="flex items-center justify-between text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  <span>Minimum area size</span>
                  <span className="rounded border border-border bg-background px-2 py-1 font-semibold text-foreground">
                    {minRoiPixels}px
                  </span>
                </label>
                <p className="text-xs text-muted-foreground">
                  Tiny areas are noisy and give unstable scores. Increase this for cleaner, more reliable comparisons.
                </p>
                <input
                  type="range"
                  min={8}
                  max={96}
                  step={4}
                  value={minRoiPixels}
                  onChange={(event) => setMinRoiPixels(Number(event.currentTarget.value))}
                  className="w-full accent-primary"
                />
                <p className="text-xs text-muted-foreground">
                  Default is 24px because areas smaller than that often produce overconfident matches.
                </p>
              </div>

              <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3 text-xs lg:col-span-2">
                <p className="font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Model Selection
                </p>
                <p className="text-xs text-muted-foreground">
                  Use multiple models for a second opinion. Final score uses the lowest model score for safer decisions.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {MODEL_CATALOG.map((entry) => {
                    const checked = selectedModelIds.includes(entry.id)
                    return (
                      <label
                        key={entry.id}
                        className="flex cursor-pointer items-start gap-2 rounded border border-border bg-background p-2"
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 accent-primary"
                          checked={checked}
                          onChange={(event) =>
                            toggleModel(entry.id, event.currentTarget.checked)
                          }
                        />
                        <span className="space-y-0.5">
                          <span className="block text-sm font-medium text-foreground">
                            {entry.label}
                          </span>
                          <span className="block text-[11px] text-muted-foreground">
                            {entry.notes}
                          </span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3 text-xs lg:col-span-5">
                <p className="font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  How Scoring Works
                </p>
                <p>
                  <span className="text-muted-foreground">Task:</span>{" "}
                  <span className="font-mono text-foreground">{MODEL_CONFIG.task}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Runtime:</span>{" "}
                  <span className="text-foreground">{MODEL_CONFIG.runtime}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Aggregation:</span>{" "}
                  <span className="text-foreground">{MODEL_CONFIG.aggregation}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Weights:</span>{" "}
                  <span className="text-foreground">
                    embedding {embeddingWeight.toFixed(2)} / pixel {pixelWeight.toFixed(2)}
                  </span>
                </p>
                <p>
                  <span className="text-muted-foreground">Min ROI:</span>{" "}
                  <span className="text-foreground">{minRoiPixels}px</span>
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
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                onClick={() => initWorkerModels(selectedModelIds)}
              >
                Reinitialize models
              </Button>

              <Button onClick={runCompare} disabled={!canCompare}>
                {isComparing ? "Comparing..." : "Run compare"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <ResultsPanel
          result={result}
          threshold={threshold}
          sourceCropUrl={sourceCropUrl}
          targetCropUrl={targetCropUrl}
          modelStatus={modelStatus}
          modelError={modelError}
          isComparing={isComparing}
        />
      </div>
    </main>
  )
}
