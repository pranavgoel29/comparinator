"use client"

import Image from "next/image"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { modelLabelFromId } from "@/lib/comparator/model-config"
import { isPass } from "@/lib/comparator/metrics"
import type { CompareResult } from "@/lib/comparator/types"

type ResultsPanelProps = {
  result: CompareResult | null
  threshold: number
  sourceCropUrl: string | null
  targetCropUrl: string | null
  modelStatus: "idle" | "loading" | "ready" | "error"
  modelError: string | null
  isComparing: boolean
}

function statusChipClass(status: ResultsPanelProps["modelStatus"]) {
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

function ScoreRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1.5 rounded-md border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between text-xs uppercase tracking-[0.14em] text-muted-foreground">
        <span>{label}</span>
        <span className="text-base font-semibold tracking-normal text-foreground">
          {value.toFixed(4)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded bg-muted">
        <div
          className="h-full rounded bg-primary transition-all duration-500"
          style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }}
        />
      </div>
    </div>
  )
}

export function ResultsPanel({
  result,
  threshold,
  sourceCropUrl,
  targetCropUrl,
  modelStatus,
  modelError,
  isComparing,
}: ResultsPanelProps) {
  const verdict = result
    ? isPass(result.hybridSimilarity, threshold)
      ? "PASS"
      : "FAIL"
    : null

  return (
    <Card className="border-border bg-card shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Results
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={statusChipClass(modelStatus)}>engine: {modelStatus}</Badge>
          {verdict ? (
            <Badge
              className={
                verdict === "PASS"
                  ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border border-destructive/40 bg-destructive/10 text-destructive"
              }
            >
              verdict: {verdict}
            </Badge>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <div className="space-y-3">
          {modelError ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {modelError}
            </p>
          ) : null}

          {isComparing ? (
            <p className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-foreground">
              Running multi-model area comparison...
            </p>
          ) : null}

          {result ? (
            <div className="space-y-2">
              <ScoreRow
                label="Ensemble embedding (minimum)"
                value={result.embeddingSimilarity}
              />
              <ScoreRow label="Pixel similarity" value={result.pixelSimilarity} />
              <ScoreRow
                label="Ensemble hybrid (minimum)"
                value={result.hybridSimilarity}
              />
              <p className="text-sm text-muted-foreground">
                Active threshold: <span className="font-semibold text-foreground">{threshold.toFixed(2)}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                Weights used:{" "}
                <span className="font-semibold text-foreground">
                  embedding {result.usedWeights.embedding.toFixed(2)} / pixel {result.usedWeights.pixel.toFixed(2)}
                </span>
              </p>

              <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Per-model details ({result.aggregation})
                </p>
                <div className="space-y-2">
                  {result.perModelScores.map((item) => (
                    <div
                      key={item.modelId}
                      className="rounded border border-border bg-background px-2 py-2 text-xs"
                    >
                      <p className="font-medium text-foreground">{modelLabelFromId(item.modelId)}</p>
                      <p className="text-muted-foreground">
                        embedding {item.embeddingSimilarity.toFixed(4)} | hybrid {item.hybridSimilarity.toFixed(4)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="rounded-md border border-border bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
              Compare regions to see conservative multi-model scores and per-model breakdown.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <div className="space-y-2 rounded-md border border-border bg-muted/25 p-3">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
              Source crop
            </p>
            <div className="aspect-video overflow-hidden rounded border border-border bg-background">
              {sourceCropUrl ? (
                <Image
                  src={sourceCropUrl}
                  alt="Source selected area"
                  width={640}
                  height={360}
                  unoptimized
                  className="h-full w-full object-contain"
                />
              ) : null}
            </div>
          </div>

          <div className="space-y-2 rounded-md border border-border bg-muted/25 p-3">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
              Target crop
            </p>
            <div className="aspect-video overflow-hidden rounded border border-border bg-background">
              {targetCropUrl ? (
                <Image
                  src={targetCropUrl}
                  alt="Target selected area"
                  width={640}
                  height={360}
                  unoptimized
                  className="h-full w-full object-contain"
                />
              ) : null}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
