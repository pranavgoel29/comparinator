"use client"

import Image from "next/image"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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

function ScoreRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs uppercase tracking-wide text-zinc-400">
        <span>{label}</span>
        <span className="font-semibold text-zinc-100">{value.toFixed(4)}</span>
      </div>
      <div className="h-2 rounded bg-zinc-800">
        <div
          className="h-full rounded bg-cyan-400 transition-all duration-300"
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
  const verdict = result ? (isPass(result.hybridSimilarity, threshold) ? "PASS" : "FAIL") : null

  return (
    <Card className="border-zinc-800 bg-zinc-950/70 text-zinc-100">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-sm font-semibold tracking-wide">Comparison Results</CardTitle>
        <div className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className="border border-zinc-700 bg-zinc-900/80 text-zinc-200"
          >
            model: {modelStatus}
          </Badge>
          {verdict ? (
            <Badge
              className={
                verdict === "PASS"
                  ? "border border-emerald-600/50 bg-emerald-500/15 text-emerald-300"
                  : "border border-rose-600/50 bg-rose-500/15 text-rose-300"
              }
            >
              {verdict}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {modelError ? (
          <p className="rounded border border-rose-700/60 bg-rose-900/25 px-3 py-2 text-xs text-rose-200">
            {modelError}
          </p>
        ) : null}

        {isComparing ? (
          <p className="rounded border border-cyan-700/40 bg-cyan-900/20 px-3 py-2 text-xs text-cyan-200">
            Running ROI comparison...
          </p>
        ) : null}

        {result ? (
          <div className="space-y-3">
            <ScoreRow label="Embedding similarity" value={result.embeddingSimilarity} />
            <ScoreRow label="Pixel similarity" value={result.pixelSimilarity} />
            <ScoreRow label="Hybrid similarity" value={result.hybridSimilarity} />
            <p className="text-xs text-zinc-400">Threshold: {threshold.toFixed(2)}</p>
          </div>
        ) : (
          <p className="text-xs text-zinc-500">Compare two regions to see scores and verdict.</p>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-zinc-400">Source ROI crop</p>
            <div className="aspect-video overflow-hidden rounded-md border border-zinc-800 bg-zinc-900">
              {sourceCropUrl ? (
                <Image
                  src={sourceCropUrl}
                  alt="Source ROI"
                  width={640}
                  height={360}
                  unoptimized
                  className="h-full w-full object-contain"
                />
              ) : null}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-zinc-400">Target ROI crop</p>
            <div className="aspect-video overflow-hidden rounded-md border border-zinc-800 bg-zinc-900">
              {targetCropUrl ? (
                <Image
                  src={targetCropUrl}
                  alt="Target ROI"
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
