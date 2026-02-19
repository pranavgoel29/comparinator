"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { BenchmarkCase, BenchmarkStats } from "@/components/comparator/comparator-types"
import { formatMs } from "@/components/comparator/comparator-formatters"

type BenchmarkSummaryCardProps = {
  stats: BenchmarkStats
  threshold: number
  isRunningBenchmark: boolean
  selectedBenchmarkCase: BenchmarkCase | null
  canRunBenchmark: boolean
  isComparing: boolean
  hasCases: boolean
  onRunBenchmarkSuite: () => void
  onOpenAnalytics: () => void
  onClearCases: () => void
  onShowLiveCompare: () => void
}

export function BenchmarkSummaryCard({
  stats,
  threshold,
  isRunningBenchmark,
  selectedBenchmarkCase,
  canRunBenchmark,
  isComparing,
  hasCases,
  onRunBenchmarkSuite,
  onOpenAnalytics,
  onClearCases,
  onShowLiveCompare,
}: BenchmarkSummaryCardProps) {
  return (
    <>
      <div className="space-y-4 rounded-xl border border-border bg-muted/25 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              {isRunningBenchmark
                ? "Benchmark run in progress"
                : stats.total
                  ? "Benchmark summary"
                  : "No benchmark cases yet"}
            </p>
            <p className="text-xs text-muted-foreground">
              {stats.total
                ? `${stats.processedCount} of ${stats.total} cases processed.`
                : "Add source-target pairs to enable benchmark analytics."}
            </p>
          </div>
          <Badge variant="outline">Threshold {threshold.toFixed(2)}</Badge>
        </div>

        {selectedBenchmarkCase ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/10 px-2 py-1">
            <p className="text-xs text-foreground">Showing in Results: {selectedBenchmarkCase.label}</p>
            <Button size="sm" variant="outline" onClick={onShowLiveCompare}>
              Show live compare
            </Button>
          </div>
        ) : null}

        <div className="space-y-1">
          <div className="h-2 overflow-hidden rounded-full bg-background">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                isRunningBenchmark ? "bg-amber-500" : "bg-primary"
              }`}
              style={{
                width: `${Math.max(0, Math.min(100, stats.progress * 100))}%`,
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">Progress: {(stats.progress * 100).toFixed(0)}%</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">View: {selectedBenchmarkCase ? "Pinned case" : "Live compare"}</Badge>
            <Badge
              className={
                isRunningBenchmark
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200"
                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              }
            >
              {isRunningBenchmark ? "Run active" : "Run idle"}
            </Badge>
            <Badge variant="outline">Scored: {stats.finished}</Badge>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-border bg-background/80 p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Pass rate</p>
            <p className="text-base font-semibold text-foreground">{(stats.passRate * 100).toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground">
              {stats.passCount} pass / {stats.failCount} fail
            </p>
          </div>

          <div className="rounded-lg border border-border bg-background/80 p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Avg hybrid score</p>
            <p className="text-base font-semibold text-foreground">{stats.avgHybrid.toFixed(4)}</p>
            <p className="text-xs text-muted-foreground">
              range {stats.minHybrid.toFixed(4)} {"->"} {stats.maxHybrid.toFixed(4)}
            </p>
          </div>

          <div className="rounded-lg border border-border bg-background/80 p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Avg latency</p>
            <p className="text-base font-semibold text-foreground">{formatMs(stats.avgDuration)}</p>
            <p className="text-xs text-muted-foreground">
              Running: {stats.runningCount} | Errors: {stats.errorCount}
            </p>
          </div>

          <div className="rounded-lg border border-border bg-background/80 p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Best / worst case</p>
            <p className="truncate text-sm font-semibold text-foreground">
              Best: {stats.bestCase ? `${stats.bestCase.result.hybridSimilarity.toFixed(4)} (${stats.bestCase.label})` : "-"}
            </p>
            <p className="truncate text-sm font-semibold text-foreground">
              Worst: {stats.worstCase ? `${stats.worstCase.result.hybridSimilarity.toFixed(4)} (${stats.worstCase.label})` : "-"}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={onRunBenchmarkSuite} disabled={!canRunBenchmark}>
          {isRunningBenchmark ? "Running benchmark..." : "Run benchmark suite"}
        </Button>
        <Button variant="outline" onClick={onOpenAnalytics}>
          Open analytics
        </Button>
        <Button
          variant="outline"
          onClick={onClearCases}
          disabled={isComparing || isRunningBenchmark || !hasCases}
        >
          Clear all cases
        </Button>
      </div>
    </>
  )
}
