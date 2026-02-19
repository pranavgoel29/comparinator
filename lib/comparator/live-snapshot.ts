import type { BenchmarkRunSnapshot } from "@/lib/comparator/types"

export const LIVE_BENCHMARK_SNAPSHOT_KEY = "comparinator:live-benchmark-snapshot"

function hasSnapshotShape(value: unknown): value is BenchmarkRunSnapshot {
  if (!value || typeof value !== "object") {
    return false
  }
  const entry = value as Record<string, unknown>
  return (
    typeof entry.savedAt === "number" &&
    typeof entry.threshold === "number" &&
    Array.isArray(entry.modelIds) &&
    Array.isArray(entry.caseOutcomes) &&
    Array.isArray(entry.perModelSummary)
  )
}

export function saveLiveBenchmarkSnapshot(snapshot: BenchmarkRunSnapshot | null) {
  if (typeof sessionStorage === "undefined") {
    return
  }
  if (!snapshot) {
    sessionStorage.removeItem(LIVE_BENCHMARK_SNAPSHOT_KEY)
    return
  }
  sessionStorage.setItem(LIVE_BENCHMARK_SNAPSHOT_KEY, JSON.stringify(snapshot))
}

export function loadLiveBenchmarkSnapshot() {
  if (typeof sessionStorage === "undefined") {
    return null
  }
  const raw = sessionStorage.getItem(LIVE_BENCHMARK_SNAPSHOT_KEY)
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    return hasSnapshotShape(parsed) ? parsed : null
  } catch {
    return null
  }
}
