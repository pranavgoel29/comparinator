import type { ExpectedOutcome, ModelRuntimeStatus } from "@/lib/comparator/types"
import type {
  BenchmarkCaseStatus,
  BenchmarkPreset,
  ModelStatus,
} from "@/components/comparator/comparator-types"

export function statusChipClass(status: ModelStatus) {
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

export function readinessLabel(loaded: boolean) {
  return loaded ? "Loaded" : "Waiting"
}

export function benchmarkStatusChipClass(status: BenchmarkCaseStatus) {
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

export function formatMs(value: number | null) {
  if (value === null) {
    return "-"
  }
  return `${value} ms`
}

export function formatBytes(sizeBytes: number | null) {
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

export function modelPhaseBadgeClass(phase: ModelRuntimeStatus["phase"]) {
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

export function formatOutcome(outcome: ExpectedOutcome) {
  return outcome === "match" ? "match" : "non-match"
}

export function presetLabel(preset: BenchmarkPreset) {
  if (preset === "fast") return "Fast"
  if (preset === "balanced") return "Balanced"
  if (preset === "thorough") return "Thorough"
  return "Custom"
}
