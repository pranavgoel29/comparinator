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

type Verdict = "PASS" | "FAIL"

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

function verdictChipClass(verdict: Verdict) {
  if (verdict === "PASS") {
    return "border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
  }

  return "border border-destructive/40 bg-destructive/10 text-destructive"
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function formatSigned(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(4)}`
}

function decisionStrength(margin: number) {
  if (margin >= 0.08) {
    return {
      label: "clear match",
      className:
        "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    }
  }

  if (margin >= 0.02) {
    return {
      label: "lean match",
      className:
        "border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300",
    }
  }

  if (margin > -0.02) {
    return {
      label: "borderline",
      className:
        "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200",
    }
  }

  if (margin > -0.08) {
    return {
      label: "lean mismatch",
      className:
        "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
    }
  }

  return {
    label: "clear mismatch",
    className:
      "border-destructive/40 bg-destructive/10 text-destructive",
  }
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
  const verdict: Verdict | null = result
    ? isPass(result.hybridSimilarity, threshold)
      ? "PASS"
      : "FAIL"
    : null
  const margin = result ? result.hybridSimilarity - threshold : 0
  const strength = result ? decisionStrength(margin) : null
  const sortedModelScores = result
    ? [...result.perModelScores].sort(
        (a, b) => a.hybridSimilarity - b.hybridSimilarity
      )
    : []
  const limitingModel = sortedModelScores[0] ?? null

  return (
    <Card className="border-border bg-card shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Results
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={statusChipClass(modelStatus)}>engine: {modelStatus}</Badge>
          {verdict ? (
            <Badge className={verdictChipClass(verdict)}>
              verdict: {verdict}
            </Badge>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
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
              <div className="space-y-3 rounded-xl border border-border bg-muted/25 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      Decision summary
                    </p>
                    <p
                      className={
                        verdict === "PASS"
                          ? "text-xl font-semibold text-emerald-700 dark:text-emerald-300"
                          : "text-xl font-semibold text-destructive"
                      }
                    >
                      {verdict}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      hybrid {result.hybridSimilarity.toFixed(4)} vs threshold{" "}
                      {threshold.toFixed(2)} ({formatSigned(margin)})
                    </p>
                  </div>
                  {strength ? (
                    <Badge className={strength.className}>
                      confidence: {strength.label}
                    </Badge>
                  ) : null}
                </div>

                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-md border border-border bg-background/85 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                      Hybrid
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      {formatPercent(result.hybridSimilarity)}
                    </p>
                  </div>
                  <div className="rounded-md border border-border bg-background/85 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                      Embedding
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      {formatPercent(result.embeddingSimilarity)}
                    </p>
                  </div>
                  <div className="rounded-md border border-border bg-background/85 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                      Pixel
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      {formatPercent(result.pixelSimilarity)}
                    </p>
                  </div>
                  <div className="rounded-md border border-border bg-background/85 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                      Weights
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      m {result.usedWeights.embedding.toFixed(2)} / p{" "}
                      {result.usedWeights.pixel.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>

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
                {limitingModel ? (
                  <p className="text-xs text-muted-foreground">
                    Limiting model:{" "}
                    <span className="font-semibold text-foreground">
                      {modelLabelFromId(limitingModel.modelId)}
                    </span>{" "}
                    with hybrid {limitingModel.hybridSimilarity.toFixed(4)}. Conservative mode uses the lowest model score.
                  </p>
                ) : null}
                <div className="space-y-2">
                  {sortedModelScores.map((item) => (
                    <div
                      key={item.modelId}
                      className="space-y-1 rounded border border-border bg-background px-2 py-2 text-xs"
                    >
                      <p className="font-medium text-foreground">
                        {modelLabelFromId(item.modelId)}
                        {limitingModel?.modelId === item.modelId ? " (limiting)" : ""}
                      </p>
                      <p className="text-muted-foreground">
                        embedding {item.embeddingSimilarity.toFixed(4)} | hybrid {item.hybridSimilarity.toFixed(4)}
                      </p>
                      <div className="h-1.5 overflow-hidden rounded bg-muted">
                        <div
                          className={`h-full rounded transition-all duration-500 ${
                            limitingModel?.modelId === item.modelId
                              ? "bg-amber-500"
                              : "bg-primary"
                          }`}
                          style={{
                            width: `${Math.max(
                              0,
                              Math.min(100, item.hybridSimilarity * 100)
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="rounded-md border border-border bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
              Compare selected areas to see conservative multi-model scores and per-model breakdown.
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
