"use client"

import Image from "next/image"

import { benchmarkStatusChipClass, formatOutcome } from "@/components/comparator/comparator-formatters"
import type { BenchmarkCase } from "@/components/comparator/comparator-types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { isCorrectOutcome, predictedOutcomeFromScore } from "@/lib/comparator/benchmark-analytics"
import { modelLabelFromId } from "@/lib/comparator/model-config"
import { isPass } from "@/lib/comparator/metrics"
import type { ExpectedOutcome } from "@/lib/comparator/types"

type BenchmarkCasesListProps = {
  benchmarkCases: BenchmarkCase[]
  selectedBenchmarkCaseId: string | null
  threshold: number
  isRunningBenchmark: boolean
  onSelectBenchmarkCase: (id: string) => void
  onSetExpectedOutcome: (id: string, expectedOutcome: ExpectedOutcome) => void
  onRemoveBenchmarkCase: (id: string) => void
}

export function BenchmarkCasesList({
  benchmarkCases,
  selectedBenchmarkCaseId,
  threshold,
  isRunningBenchmark,
  onSelectBenchmarkCase,
  onSetExpectedOutcome,
  onRemoveBenchmarkCase,
}: BenchmarkCasesListProps) {
  if (!benchmarkCases.length) {
    return (
      <p className="rounded-md border border-border bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
        Add current source/target pairs here, then run all to benchmark many image comparisons quickly.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {benchmarkCases.map((item, index) => {
        const predictedOutcome = item.result
          ? predictedOutcomeFromScore(item.result.hybridSimilarity, threshold)
          : null
        const outcomeCorrect =
          predictedOutcome === null ? null : isCorrectOutcome(item.expectedOutcome, predictedOutcome)

        return (
          <div
            key={item.id}
            className={`space-y-3 rounded-lg border p-3 transition-colors md:p-4 ${
              selectedBenchmarkCaseId === item.id
                ? "border-primary/60 bg-primary/5 ring-1 ring-primary/40"
                : "border-border bg-muted/20"
            }`}
            role="button"
            tabIndex={0}
            onClick={() => onSelectBenchmarkCase(item.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                onSelectBenchmarkCase(item.id)
              }
            }}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  {index + 1}. {item.label}
                </p>
                <p className="text-xs text-muted-foreground">
                  {item.sourceName} {"->"} {item.targetName}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {selectedBenchmarkCaseId === item.id ? (
                  <Badge className="border-primary/40 bg-primary/10 text-primary">showing in results</Badge>
                ) : null}
                <Badge variant="outline">expected: {formatOutcome(item.expectedOutcome)}</Badge>
                <Badge className={benchmarkStatusChipClass(item.status)}>status: {item.status}</Badge>
                {item.result ? (
                  <Badge
                    className={
                      isPass(item.result.hybridSimilarity, threshold)
                        ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "border border-destructive/40 bg-destructive/10 text-destructive"
                    }
                  >
                    verdict: {isPass(item.result.hybridSimilarity, threshold) ? "PASS" : "FAIL"}
                  </Badge>
                ) : null}
                {predictedOutcome ? (
                  <Badge variant="outline">predicted: {formatOutcome(predictedOutcome)}</Badge>
                ) : null}
                {outcomeCorrect !== null ? (
                  <Badge
                    className={
                      outcomeCorrect
                        ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "border border-destructive/40 bg-destructive/10 text-destructive"
                    }
                  >
                    correctness: {outcomeCorrect ? "correct" : "incorrect"}
                  </Badge>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[320px_1fr_auto]">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1 rounded-md border border-border bg-background/80 p-2">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Source crop</p>
                  <div className="aspect-video overflow-hidden rounded border border-border bg-background">
                    <Image
                      src={item.sourceDataUrl}
                      alt={`${item.sourceName} crop`}
                      width={320}
                      height={180}
                      unoptimized
                      className="h-full w-full object-contain"
                    />
                  </div>
                </div>

                <div className="space-y-1 rounded-md border border-border bg-background/80 p-2">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Target crop</p>
                  <div className="aspect-video overflow-hidden rounded border border-border bg-background">
                    <Image
                      src={item.targetDataUrl}
                      alt={`${item.targetName} crop`}
                      width={320}
                      height={180}
                      unoptimized
                      className="h-full w-full object-contain"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                {item.result ? (
                  <>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <div className="rounded border border-border bg-background/80 px-2 py-2">
                        <p className="uppercase tracking-[0.12em] text-muted-foreground">Embedding</p>
                        <p className="text-sm font-semibold text-foreground">
                          {item.result.compute.embeddingSkipped ? "skipped" : item.result.embeddingSimilarity.toFixed(4)}
                        </p>
                      </div>
                      <div className="rounded border border-border bg-background/80 px-2 py-2">
                        <p className="uppercase tracking-[0.12em] text-muted-foreground">Pixel</p>
                        <p className="text-sm font-semibold text-foreground">
                          {item.result.compute.pixelSkipped ? "skipped" : item.result.pixelSimilarity.toFixed(4)}
                        </p>
                      </div>
                      <div className="rounded border border-border bg-background/80 px-2 py-2">
                        <p className="uppercase tracking-[0.12em] text-muted-foreground">Hybrid</p>
                        <p className="text-sm font-semibold text-foreground">{item.result.hybridSimilarity.toFixed(4)}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
                      <p>
                        time: <span className="font-medium text-foreground">{item.durationMs ? `${item.durationMs} ms` : "-"}</span>
                      </p>
                      <p>
                        worker: <span className="font-medium text-foreground">total {item.result.timingsMs.total} ms</span>
                      </p>
                      <p>
                        threshold: <span className="font-medium text-foreground">{threshold.toFixed(2)}</span>
                      </p>
                      <p>
                        weights: <span className="font-medium text-foreground">model {item.result.usedWeights.embedding.toFixed(2)} / pixel {item.result.usedWeights.pixel.toFixed(2)}</span>
                      </p>
                      <p>
                        aggregation: <span className="font-medium text-foreground">{item.result.aggregation}</span>
                      </p>
                      <p>
                        cache: <span className="font-medium text-foreground">pixel {item.result.cacheStats.pixelCacheHit ? "hit" : "miss"} | embedding {item.result.cacheStats.embeddingHits}/{item.result.cacheStats.embeddingMisses}</span>
                      </p>
                    </div>

                    <div className="space-y-1">
                      <p className="uppercase tracking-[0.12em] text-muted-foreground">Per-model details</p>
                      <div className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
                        {item.result.perModelScores.map((model) => (
                          <div key={model.modelId} className="rounded border border-border bg-background/80 px-2 py-1.5">
                            <p className="font-medium text-foreground">{modelLabelFromId(model.modelId)}</p>
                            <p className="text-muted-foreground">
                              embedding {model.embeddingSimilarity.toFixed(4)} | hybrid {model.hybridSimilarity.toFixed(4)}
                            </p>
                            <p className="text-muted-foreground">
                              predicted {formatOutcome(predictedOutcomeFromScore(model.hybridSimilarity, threshold))} |
                              {" "}
                              {isCorrectOutcome(item.expectedOutcome, predictedOutcomeFromScore(model.hybridSimilarity, threshold))
                                ? "correct"
                                : "incorrect"}
                            </p>
                            <p className="text-muted-foreground">
                              latency {model.latencyMs} ms | embedding cache {model.embeddingCacheHit ? "hit" : "miss"}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="rounded border border-border bg-background/80 px-3 py-2 text-muted-foreground">
                    {item.status === "running"
                      ? "Comparison is running for this case."
                      : "Run benchmark to see full score breakdown for this case."}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
                <Select
                  value={item.expectedOutcome}
                  onValueChange={(nextValue) => {
                    if (nextValue === "match" || nextValue === "non-match") {
                      onSetExpectedOutcome(item.id, nextValue)
                    }
                  }}
                >
                  <SelectTrigger
                    size="sm"
                    onClick={(event) => event.stopPropagation()}
                    className="min-w-[160px]"
                  >
                    <SelectValue placeholder="Expected outcome" />
                  </SelectTrigger>
                  <SelectContent onClick={(event) => event.stopPropagation()}>
                    <SelectItem value="match">Expected: match</SelectItem>
                    <SelectItem value="non-match">Expected: non-match</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(event) => {
                    event.stopPropagation()
                    onSelectBenchmarkCase(item.id)
                  }}
                >
                  View in Results
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(event) => {
                    event.stopPropagation()
                    onRemoveBenchmarkCase(item.id)
                  }}
                  disabled={isRunningBenchmark}
                >
                  Remove
                </Button>
              </div>
            </div>

            {item.error ? <p className="text-xs text-destructive">{item.error}</p> : null}
          </div>
        )
      })}
    </div>
  )
}
