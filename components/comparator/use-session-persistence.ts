"use client"

import * as React from "react"

import { clearLatestSession, saveLatestSession, type PersistedSessionV1 } from "@/lib/comparator/session-store"
import { saveLiveBenchmarkSnapshot } from "@/lib/comparator/live-snapshot"
import { MODEL_CONFIG } from "@/lib/comparator/model-config"
import { SESSION_SAVE_DEBOUNCE_MS } from "@/components/comparator/comparator-types"
import type { UseComparatorSessionArgs } from "@/components/comparator/comparator-session-types"
import { toPersistedBenchmarkCase } from "@/components/comparator/session-serialization"

export function useSessionPersistence(args: UseComparatorSessionArgs, isSessionHydrated: boolean) {
  const {
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
    setRuntimeInfo,
    setModelError,
    setLatestRunSnapshot,
  } = args

  const saveErrorShownRef = React.useRef(false)

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

      const persistedCases = benchmarkCases.map((item) => toPersistedBenchmarkCase(item))
      const selectedId = selectedBenchmarkCaseId && persistedCases.some((item) => item.id === selectedBenchmarkCaseId)
        ? selectedBenchmarkCaseId
        : null
      const nextModelIds = selectedModelIds.length
        ? selectedModelIds
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
          selectedPreset,
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
          setModelError((previous) => (previous?.includes("Could not persist session") ? null : previous))
          saveErrorShownRef.current = false
        }
      } catch {
        if (!saveErrorShownRef.current) {
          setModelError("Could not persist session (storage quota exceeded or browser storage unavailable).")
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
    setModelError,
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

  const clearSavedSession = React.useCallback(async () => {
    try {
      await clearLatestSession()
      setRuntimeInfo("Saved session cleared from browser storage.")
      setModelError(null)
      setLatestRunSnapshot(null)
      saveLiveBenchmarkSnapshot(null)
      saveErrorShownRef.current = false
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to clear saved session."
      setModelError(message)
    }
  }, [setLatestRunSnapshot, setModelError, setRuntimeInfo])

  return { clearSavedSession }
}
