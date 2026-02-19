"use client"

import * as React from "react"

import { BBoxEditorCanvas } from "@/components/comparator/bbox-editor-canvas"
import { BBoxJsonEditor } from "@/components/comparator/bbox-json-editor"
import { ImageUploadPanel } from "@/components/comparator/image-upload-panel"
import { ResultsPanel } from "@/components/comparator/results-panel"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { createDefaultBBox, isBBoxAtLeastMinPixels } from "@/lib/comparator/bbox"
import { cropImageRegion, fileToImageBitmap } from "@/lib/comparator/image"
import type {
  CompareResult,
  NormalizedBBox,
  WorkerRequest,
  WorkerResponse,
} from "@/lib/comparator/types"

const DEFAULT_THRESHOLD = 0.85
const MIN_PIXELS = 8

type ModelStatus = "idle" | "loading" | "ready" | "error"

export function ComparatorApp() {
  const [sourceBitmap, setSourceBitmap] = React.useState<ImageBitmap | null>(null)
  const [targetBitmap, setTargetBitmap] = React.useState<ImageBitmap | null>(null)
  const [sourceFileName, setSourceFileName] = React.useState<string>()
  const [targetFileName, setTargetFileName] = React.useState<string>()
  const [sourceBBox, setSourceBBox] = React.useState<NormalizedBBox | null>(null)
  const [targetBBox, setTargetBBox] = React.useState<NormalizedBBox | null>(null)
  const [threshold, setThreshold] = React.useState(DEFAULT_THRESHOLD)

  const [result, setResult] = React.useState<CompareResult | null>(null)
  const [sourceCropUrl, setSourceCropUrl] = React.useState<string | null>(null)
  const [targetCropUrl, setTargetCropUrl] = React.useState<string | null>(null)

  const [isComparing, setIsComparing] = React.useState(false)
  const [modelStatus, setModelStatus] = React.useState<ModelStatus>("idle")
  const [modelError, setModelError] = React.useState<string | null>(null)

  const workerRef = React.useRef<Worker | null>(null)
  const sourceBitmapRef = React.useRef<ImageBitmap | null>(null)
  const targetBitmapRef = React.useRef<ImageBitmap | null>(null)

  React.useEffect(() => {
    const worker = new Worker(
      new URL("../../workers/embedding.worker.ts", import.meta.url),
      { type: "module" }
    )

    workerRef.current = worker
    setModelStatus("loading")

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data

      if (message.type === "model-ready") {
        setModelStatus("ready")
        setModelError(null)
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

    worker.postMessage({ type: "init-model" } satisfies WorkerRequest)

    return () => {
      worker.terminate()
      workerRef.current = null
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
      setModelError("Upload both images and define both source and target ROI.")
      return
    }

    if (
      !isBBoxAtLeastMinPixels(sourceBBox, {
        width: sourceBitmap.width,
        height: sourceBitmap.height,
      }, MIN_PIXELS)
    ) {
      setModelError("Source ROI must be at least 8x8 pixels.")
      return
    }

    if (
      !isBBoxAtLeastMinPixels(targetBBox, {
        width: targetBitmap.width,
        height: targetBitmap.height,
      }, MIN_PIXELS)
    ) {
      setModelError("Target ROI must be at least 8x8 pixels.")
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
      },
    } satisfies WorkerRequest)
  }, [modelStatus, sourceBBox, sourceBitmap, targetBBox, targetBitmap])

  const canCompare =
    modelStatus === "ready" &&
    !isComparing &&
    Boolean(sourceBitmap && targetBitmap && sourceBBox && targetBBox)

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#1f2937_0%,_#020617_55%,_#000_100%)] px-4 py-6 text-zinc-100 sm:px-6 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="rounded-2xl border border-zinc-800/80 bg-zinc-950/65 px-5 py-5 shadow-[0_20px_70px_rgba(0,0,0,0.45)] backdrop-blur">
          <p className="text-xs uppercase tracking-[0.22em] text-cyan-300/80">Comparinator</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
            Local ROI Image Comparator
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-zinc-400">
            Define source and target ROIs independently (canvas or JSON), then compare those exact regions with browser-local CLIP embeddings + pixel similarity.
          </p>
        </header>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <ImageUploadPanel
              title="Source Image"
              fileName={sourceFileName}
              dimensions={sourceDimensions}
              onSelect={(file) => uploadImage("source", file)}
            >
              <BBoxJsonEditor
                title="Source ROI"
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
              label="Source ROI (editable)"
            />
          </div>

          <div className="space-y-4">
            <ImageUploadPanel
              title="Target Image"
              fileName={targetFileName}
              dimensions={targetDimensions}
              onSelect={(file) => uploadImage("target", file)}
            >
              <BBoxJsonEditor
                title="Target ROI"
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
              label="Target ROI (editable)"
            />
          </div>
        </section>

        <Card className="border-zinc-800 bg-zinc-950/70 text-zinc-100">
          <CardHeader>
            <CardTitle className="text-sm font-semibold tracking-wide">Comparison Controls</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="space-y-3">
              <label className="flex items-center justify-between text-xs uppercase tracking-wide text-zinc-400">
                <span>Pass threshold</span>
                <span className="font-semibold text-zinc-200">{threshold.toFixed(2)}</span>
              </label>

              <input
                type="range"
                min={0.5}
                max={0.99}
                step={0.01}
                value={threshold}
                onChange={(event) => setThreshold(Number(event.target.value))}
                className="w-full accent-cyan-400"
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
                className="h-9 w-28 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm text-zinc-100"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                className="border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
                onClick={() => {
                  setModelStatus("loading")
                  setModelError(null)
                  workerRef.current?.postMessage({ type: "init-model" } satisfies WorkerRequest)
                }}
              >
                Retry model init
              </Button>

              <Button
                onClick={runCompare}
                disabled={!canCompare}
                className="bg-cyan-500 text-slate-950 hover:bg-cyan-400"
              >
                {isComparing ? "Comparing..." : "Compare ROI"}
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
