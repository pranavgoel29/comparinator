"use client"

import * as React from "react"
import Link from "next/link"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts"

import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { loadLiveBenchmarkSnapshot } from "@/lib/comparator/live-snapshot"
import { modelLabelFromId } from "@/lib/comparator/model-config"
import { loadLatestSession } from "@/lib/comparator/session-store"
import type { BenchmarkRunSnapshot } from "@/lib/comparator/types"

function formatMs(value: number | null) {
  if (value === null) {
    return "-"
  }
  return `${value} ms`
}

export function BenchmarkAnalyticsPage() {
  const [snapshot, setSnapshot] = React.useState<BenchmarkRunSnapshot | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const liveSnapshot = loadLiveBenchmarkSnapshot()
        const session = await loadLatestSession()
        if (cancelled) {
          return
        }
        const persisted = session?.benchmark.latestRunSnapshot ?? null
        if (!persisted && liveSnapshot) {
          setSnapshot(liveSnapshot)
          return
        }
        if (!liveSnapshot && persisted) {
          setSnapshot(persisted)
          return
        }
        if (liveSnapshot && persisted) {
          setSnapshot(
            liveSnapshot.savedAt >= persisted.savedAt ? liveSnapshot : persisted
          )
          return
        }
        setSnapshot(null)
      } catch (loadError) {
        if (cancelled) {
          return
        }
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load benchmark analytics."
        )
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (isLoading) {
    return (
      <main className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">
              Loading analytics snapshot...
            </CardContent>
          </Card>
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Card>
            <CardContent className="space-y-3 py-8">
              <p className="text-sm text-destructive">{error}</p>
              <Button asChild variant="outline">
                <Link href="/">Back to comparator</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    )
  }

  if (!snapshot) {
    return (
      <main className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Card>
            <CardHeader className="space-y-2">
              <CardTitle className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Benchmark Analytics
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                No benchmark snapshot was found yet. Run a benchmark suite first.
              </p>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <Link href="/">Back to comparator</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    )
  }

  const correctnessData = [
    { key: "correct", label: "Correct", value: snapshot.correctCount, fill: "var(--color-correct)" },
    {
      key: "incorrect",
      label: "Incorrect",
      value: snapshot.incorrectCount,
      fill: "var(--color-incorrect)",
    },
  ]
  const modelCorrectnessData = snapshot.perModelSummary.map((item) => ({
    modelId: item.modelId,
    model: modelLabelFromId(item.modelId),
    correctnessRate: Number((item.correctnessRate * 100).toFixed(1)),
    correct: item.correct,
    incorrect: item.incorrect,
  }))
  const latencyData = snapshot.perModelSummary
    .filter((item) => item.avgLatencyMs !== null)
    .map((item) => ({
      modelId: item.modelId,
      model: modelLabelFromId(item.modelId),
      avgLatencyMs: item.avgLatencyMs ?? 0,
    }))
  const incorrectCases = snapshot.caseOutcomes.filter(
    (item) => item.correct === false || item.status === "error"
  )

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <Card className="border-border/80 bg-card shadow-sm">
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  Benchmark Analytics
                </p>
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  Correctness + Performance
                </h1>
              </div>
              <Button asChild variant="outline">
                <Link href="/">Back to comparator</Link>
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Total cases: {snapshot.totalCases}</Badge>
              <Badge variant="outline">Processed: {snapshot.processedCases}</Badge>
              <Badge variant="outline">Correct: {snapshot.correctCount}</Badge>
              <Badge variant="outline">Incorrect: {snapshot.incorrectCount}</Badge>
              <Badge variant="outline">Run threshold: {snapshot.threshold.toFixed(2)}</Badge>
            </div>
          </CardHeader>
        </Card>

        <section className="grid gap-4 xl:grid-cols-3">
          <Card className="border-border bg-card shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Ensemble Correctness
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer
                className="mx-auto aspect-square max-h-[260px]"
                config={{
                  correct: { label: "Correct", color: "var(--chart-2)" },
                  incorrect: { label: "Incorrect", color: "var(--destructive)" },
                }}
              >
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                  <Pie data={correctnessData} dataKey="value" nameKey="label" innerRadius={50}>
                    {correctnessData.map((entry) => (
                      <Cell key={entry.key} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card className="border-border bg-card shadow-sm xl:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Per-Model Correctness Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer
                className="max-h-[320px]"
                config={{
                  correctnessRate: { label: "Correctness %", color: "var(--chart-3)" },
                }}
              >
                <BarChart data={modelCorrectnessData}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="model"
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={70}
                  />
                  <YAxis domain={[0, 100]} tickLine={false} axisLine={false} />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value, _name, item) => {
                          const payload = item?.payload as
                            | (typeof modelCorrectnessData)[number]
                            | undefined
                          return (
                            <div className="flex flex-col gap-0.5">
                              <span>{`${Number(value).toFixed(1)}%`}</span>
                              <span className="text-muted-foreground">
                                {payload ? `${payload.correct} correct / ${payload.incorrect} incorrect` : ""}
                              </span>
                            </div>
                          )
                        }}
                      />
                    }
                  />
                  <Bar
                    dataKey="correctnessRate"
                    fill="var(--color-correctnessRate)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </section>

        <Card className="border-border bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Per-Model Latency
            </CardTitle>
          </CardHeader>
          <CardContent>
            {latencyData.length ? (
              <ChartContainer
                className="max-h-[340px]"
                config={{
                  avgLatencyMs: { label: "Avg latency (ms)", color: "var(--chart-1)" },
                }}
              >
                <BarChart data={latencyData}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="model"
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={70}
                  />
                  <YAxis tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="avgLatencyMs" fill="var(--color-avgLatencyMs)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            ) : (
              <p className="text-sm text-muted-foreground">
                No model latency values are available for this run.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="space-y-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Incorrect Comparisons
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Cases where predicted outcome did not match expected outcome, or where the case errored.
            </p>
          </CardHeader>
          <CardContent>
            {incorrectCases.length ? (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="min-w-full border-collapse text-xs">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2 text-left font-medium">Case</th>
                      <th className="px-2 py-2 text-left font-medium">Expected</th>
                      <th className="px-2 py-2 text-left font-medium">Predicted</th>
                      <th className="px-2 py-2 text-left font-medium">Score</th>
                      <th className="px-2 py-2 text-left font-medium">Run threshold</th>
                      <th className="px-2 py-2 text-left font-medium">Failing models</th>
                      <th className="px-2 py-2 text-left font-medium">Latency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incorrectCases.map((item) => (
                      <tr key={item.caseId} className="border-t border-border/60">
                        <td className="px-2 py-2 text-foreground">{item.label}</td>
                        <td className="px-2 py-2 text-muted-foreground">
                          {item.expectedOutcome}
                        </td>
                        <td className="px-2 py-2 text-muted-foreground">
                          {item.predictedOutcome ?? "error"}
                        </td>
                        <td className="px-2 py-2 text-foreground">
                          {typeof item.hybridSimilarity === "number"
                            ? item.hybridSimilarity.toFixed(4)
                            : "-"}
                        </td>
                        <td className="px-2 py-2 text-muted-foreground">
                          {snapshot.threshold.toFixed(2)}
                        </td>
                        <td className="px-2 py-2 text-muted-foreground">
                          {item.failingModels.length
                            ? item.failingModels.map((modelId) => modelLabelFromId(modelId)).join(", ")
                            : item.error
                              ? "runtime error"
                              : "-"}
                        </td>
                        <td className="px-2 py-2 text-muted-foreground">
                          {formatMs(item.totalLatencyMs)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No incorrect comparisons found in this run.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
