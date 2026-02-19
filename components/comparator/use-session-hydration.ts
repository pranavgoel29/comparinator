"use client"

import * as React from "react"

import { createDefaultBBox } from "@/lib/comparator/bbox"
import { MODEL_CONFIG } from "@/lib/comparator/model-config"
import { loadLatestSession, type PersistedSessionV1 } from "@/lib/comparator/session-store"
import type { UseComparatorSessionArgs } from "@/components/comparator/comparator-session-types"
import { isBenchmarkPreset, normalizeSelectedModelIdsFromSession, toRuntimeBenchmarkCase } from "@/components/comparator/session-serialization"

export function useSessionHydration(args: UseComparatorSessionArgs) {
  const {
    workerMounted,
    initWorkerModels,
    selectedModelIds,
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
  } = args

  const [isSessionHydrated, setIsSessionHydrated] = React.useState(false)
  const initializedAfterHydrationRef = React.useRef(false)

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

        const restoreImage = async (entry: PersistedSessionV1["source"], kind: "source" | "target") => {
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
        setSelectedPreset(isBenchmarkPreset(session.controls.selectedPreset) ? session.controls.selectedPreset : "custom")
        setLastNonCustomPreset(session.controls.lastNonCustomPreset)
        setSelectedModelIds(normalizeSelectedModelIdsFromSession(session.controls.selectedModelIds))

        const restoredCases = session.benchmark.cases.map((item) => toRuntimeBenchmarkCase(item))
        setBenchmarkCases(restoredCases)
        setLatestRunSnapshot(session.benchmark.latestRunSnapshot)

        const selectedId = session.benchmark.selectedBenchmarkCaseId && restoredCases.some((item) => item.id === session.benchmark.selectedBenchmarkCaseId)
          ? session.benchmark.selectedBenchmarkCaseId
          : null
        setSelectedBenchmarkCaseId(selectedId)
        if (selectedId) {
          const selectedCase = restoredCases.find((item) => item.id === selectedId) ?? null
          setResult(selectedCase?.result ?? null)
          setSourceCropUrl(selectedCase?.sourceDataUrl ?? null)
          setTargetCropUrl(selectedCase?.targetDataUrl ?? null)
        }
        setRuntimeInfo("Restored previous session.")
      } catch (error) {
        if (cancelled) {
          return
        }
        const message = error instanceof Error ? error.message : "Could not restore previous session."
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
  }, [
    setBenchmarkCases,
    setEmbeddingWeight,
    setLastNonCustomPreset,
    setLatestRunSnapshot,
    setMaxCompareSide,
    setMinAreaPixels,
    setQuickMode,
    setResult,
    setRuntimeInfo,
    setSelectedBenchmarkCaseId,
    setSelectedModelIds,
    setSelectedPreset,
    setSourceBBox,
    setSourceBitmap,
    setSourceCropUrl,
    setSourceFileName,
    setSourceImageBlob,
    setSourceLockAreaOnUpload,
    setTargetBBox,
    setTargetBitmap,
    setTargetCropUrl,
    setTargetFileName,
    setTargetImageBlob,
    setTargetLockAreaOnUpload,
    setThreshold,
  ])

  React.useEffect(() => {
    if (!isSessionHydrated || !workerMounted || initializedAfterHydrationRef.current) {
      return
    }
    initializedAfterHydrationRef.current = true
    initWorkerModels(selectedModelIds.length ? selectedModelIds : [...MODEL_CONFIG.defaultModelIds])
  }, [initWorkerModels, isSessionHydrated, selectedModelIds, workerMounted])

  return { isSessionHydrated }
}
