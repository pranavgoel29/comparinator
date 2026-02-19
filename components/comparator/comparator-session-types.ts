import * as React from "react"

import type { BenchmarkCase, BenchmarkPreset } from "@/components/comparator/comparator-types"
import type { BenchmarkRunSnapshot, NormalizedBBox } from "@/lib/comparator/types"

export type UseComparatorSessionArgs = {
  workerMounted: boolean
  initWorkerModels: (modelIds: string[]) => void
  sourceImageBlob: Blob | null
  targetImageBlob: Blob | null
  sourceFileName?: string
  targetFileName?: string
  sourceBBox: NormalizedBBox | null
  targetBBox: NormalizedBBox | null
  sourceLockAreaOnUpload: boolean
  targetLockAreaOnUpload: boolean
  threshold: number
  embeddingWeight: number
  minAreaPixels: number
  maxCompareSide: number
  quickMode: boolean
  selectedPreset: BenchmarkPreset
  lastNonCustomPreset: Exclude<BenchmarkPreset, "custom"> | null
  selectedModelIds: string[]
  benchmarkCases: BenchmarkCase[]
  selectedBenchmarkCaseId: string | null
  latestRunSnapshot: BenchmarkRunSnapshot | null
  isRunningBenchmark: boolean
  setSourceBitmap: React.Dispatch<React.SetStateAction<ImageBitmap | null>>
  setTargetBitmap: React.Dispatch<React.SetStateAction<ImageBitmap | null>>
  setSourceImageBlob: (value: Blob | null) => void
  setTargetImageBlob: (value: Blob | null) => void
  setSourceFileName: (value: string | undefined) => void
  setTargetFileName: (value: string | undefined) => void
  setSourceBBox: (value: NormalizedBBox | null) => void
  setTargetBBox: (value: NormalizedBBox | null) => void
  setSourceLockAreaOnUpload: (value: boolean) => void
  setTargetLockAreaOnUpload: (value: boolean) => void
  setThreshold: (value: number) => void
  setEmbeddingWeight: (value: number) => void
  setMinAreaPixels: (value: number) => void
  setMaxCompareSide: (value: number) => void
  setQuickMode: (value: boolean) => void
  setSelectedPreset: (value: BenchmarkPreset) => void
  setLastNonCustomPreset: (value: Exclude<BenchmarkPreset, "custom"> | null) => void
  setSelectedModelIds: (value: string[]) => void
  setBenchmarkCases: React.Dispatch<React.SetStateAction<BenchmarkCase[]>>
  setSelectedBenchmarkCaseId: (value: string | null) => void
  setLatestRunSnapshot: (value: BenchmarkRunSnapshot | null) => void
  setResult: (value: BenchmarkCase["result"]) => void
  setSourceCropUrl: (value: string | null) => void
  setTargetCropUrl: (value: string | null) => void
  setRuntimeInfo: (value: string | null) => void
  setModelError: React.Dispatch<React.SetStateAction<string | null>>
}
