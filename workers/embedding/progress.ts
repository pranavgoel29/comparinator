import type { ModelDownloadProgress, ModelRuntimeStatus } from "@/lib/comparator/types"
import { postMessageSafe } from "@/workers/embedding/runtime"

export function createModelStatus(
  modelId: string,
  phase: ModelRuntimeStatus["phase"],
  options?: {
    sizeBytes?: number | null
    sizeSource?: ModelRuntimeStatus["sizeSource"]
    error?: string | null
  }
): ModelRuntimeStatus {
  return {
    modelId,
    phase,
    sizeBytes: options?.sizeBytes ?? null,
    sizeSource: options?.sizeSource ?? "unknown",
    error: options?.error ?? null,
    updatedAt: Date.now(),
  }
}

export function postModelStatus(status: ModelRuntimeStatus) {
  postMessageSafe({ type: "model-status", payload: status })
}

export function normalizeWorkerError(reason: unknown, fallback: string) {
  if (!(reason instanceof Error) || !reason.message.trim()) {
    return fallback
  }
  const normalized = reason.message.replace(/\s+/g, " ").trim()
  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized
}

function toFiniteNumberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function parseProgressStatus(value: unknown): ModelDownloadProgress["status"] | null {
  if (value === "initiate" || value === "progress" || value === "done") {
    return value
  }
  return null
}

export function progressFromEvent(
  modelId: string,
  event: unknown
): ModelDownloadProgress | null {
  if (!event || typeof event !== "object") {
    return null
  }
  const entry = event as Record<string, unknown>
  const status = parseProgressStatus(entry.status)
  if (!status) {
    return null
  }

  return {
    modelId,
    status,
    file: typeof entry.file === "string" ? entry.file : null,
    progress: toFiniteNumberOrNull(entry.progress),
    loaded: toFiniteNumberOrNull(entry.loaded),
    total: toFiniteNumberOrNull(entry.total),
    updatedAt: Date.now(),
  }
}

export function postModelProgress(payload: ModelDownloadProgress) {
  postMessageSafe({ type: "model-progress", payload })
}
