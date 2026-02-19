"use client"

import { modelPhaseBadgeClass, formatBytes, presetLabel } from "@/components/comparator/comparator-formatters"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { MODEL_CONFIG } from "@/lib/comparator/model-config"
import { MODEL_SELECTION_MAX_MODELS } from "@/lib/comparator/model-id"
import type { ModelRuntimeStatus } from "@/lib/comparator/types"
import type { BenchmarkPreset } from "@/components/comparator/comparator-types"

type SelectableModelEntry = {
  readonly id: string
  readonly label: string
  readonly notes: string
}

type ComparatorControlCenterProps = {
  readonly selectedPreset: BenchmarkPreset
  readonly lastNonCustomPreset: Exclude<BenchmarkPreset, "custom"> | null
  readonly threshold: number
  readonly embeddingWeight: number
  readonly pixelWeight: number
  readonly minAreaPixels: number
  readonly maxCompareSide: number
  readonly quickMode: boolean
  readonly selectedModelIds: readonly string[]
  readonly customModelId: string
  readonly customModelError: string | null
  readonly selectableModelEntries: readonly SelectableModelEntry[]
  readonly loadedModelIds: readonly string[]
  readonly modelRuntimeStatuses: Readonly<Record<string, ModelRuntimeStatus>>
  readonly modelDownloadProgress: Readonly<Record<string, { readonly progress: number | null }>>
  readonly runtimeInfo: string | null
  readonly failedModelMessages: readonly string[]
  readonly canCompare: boolean
  readonly isComparing: boolean
  readonly isRunningBenchmark: boolean
  readonly onApplyPreset: (preset: Exclude<BenchmarkPreset, "custom">) => void
  readonly onThresholdChange: (value: number) => void
  readonly onEmbeddingWeightChange: (value: number) => void
  readonly onMinAreaPixelsChange: (value: number) => void
  readonly onMaxCompareSideChange: (value: number) => void
  readonly onQuickModeChange: (value: boolean) => void
  readonly onCustomModelIdChange: (value: string) => void
  readonly onToggleModel: (modelId: string, checked: boolean) => void
  readonly onAddCustomModel: () => void
  readonly onClearCustomModelError: () => void
  readonly onInitWorkerModels: () => void
  readonly onClearRuntimeCache: () => void
  readonly onAddCurrentPairToBenchmark: () => void
  readonly onRunCompare: () => void
}

export function ComparatorControlCenter({
  selectedPreset,
  lastNonCustomPreset,
  threshold,
  embeddingWeight,
  pixelWeight,
  minAreaPixels,
  maxCompareSide,
  quickMode,
  selectedModelIds,
  customModelId,
  customModelError,
  selectableModelEntries,
  loadedModelIds,
  modelRuntimeStatuses,
  modelDownloadProgress,
  runtimeInfo,
  failedModelMessages,
  canCompare,
  isComparing,
  isRunningBenchmark,
  onApplyPreset,
  onThresholdChange,
  onEmbeddingWeightChange,
  onMinAreaPixelsChange,
  onMaxCompareSideChange,
  onQuickModeChange,
  onCustomModelIdChange,
  onToggleModel,
  onAddCustomModel,
  onClearCustomModelError,
  onInitWorkerModels,
  onClearRuntimeCache,
  onAddCurrentPairToBenchmark,
  onRunCompare,
}: Readonly<ComparatorControlCenterProps>) {
  return (
    <Card className="border-border bg-card shadow-sm">
      <CardHeader className="space-y-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">Control Center</CardTitle>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Tune decision strictness, speed, and models here. Then run one compare or add the current pair to your benchmark suite.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3 rounded-xl border border-border bg-muted/25 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">Speed Presets</h3>
            <Badge variant="outline">Mode: {presetLabel(selectedPreset)}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">Presets are one-click starting points. You can still edit all controls manually at any time.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant={selectedPreset === "fast" ? "default" : "outline"} onClick={() => onApplyPreset("fast")}>Fast</Button>
            <Button type="button" variant={selectedPreset === "balanced" ? "default" : "outline"} onClick={() => onApplyPreset("balanced")}>Balanced</Button>
            <Button type="button" variant={selectedPreset === "thorough" ? "default" : "outline"} onClick={() => onApplyPreset("thorough")}>Thorough</Button>
            {selectedPreset === "custom" && lastNonCustomPreset ? (
              <Button type="button" variant="outline" onClick={() => onApplyPreset(lastNonCustomPreset)}>
                Reapply {presetLabel(lastNonCustomPreset)}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-xl border border-border bg-muted/25 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">Decision Settings</h3>
              <Badge variant="outline">Threshold {threshold.toFixed(2)}</Badge>
            </div>
            <div className="space-y-2 rounded-lg border border-border bg-background/80 p-3">
              <div className="flex items-center justify-between text-sm font-medium"><span>Pass/Fail cutoff</span><span>{threshold.toFixed(2)}</span></div>
              <input type="range" min={0.5} max={0.99} step={0.01} value={threshold} onChange={(event) => onThresholdChange(Number(event.target.value))} className="w-full accent-primary" />
            </div>
            <div className="space-y-2 rounded-lg border border-border bg-background/80 p-3">
              <div className="flex items-center justify-between text-sm font-medium"><span>Semantic (model) weight</span><span>{embeddingWeight.toFixed(2)}</span></div>
              <input type="range" min={0} max={1} step={0.05} value={embeddingWeight} onChange={(event) => onEmbeddingWeightChange(Number(event.currentTarget.value))} className="w-full accent-primary" />
              <p className="text-xs text-muted-foreground">Pixel weight auto-calculates to <span className="font-semibold text-foreground">{pixelWeight.toFixed(2)}</span>.</p>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-border bg-muted/25 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">Speed Settings</h3>
            <div className="space-y-2 rounded-lg border border-border bg-background/80 p-3">
              <div className="flex items-center justify-between text-sm font-medium"><span>Minimum area size</span><span>{minAreaPixels}px</span></div>
              <input type="range" min={8} max={96} step={4} value={minAreaPixels} onChange={(event) => onMinAreaPixelsChange(Number(event.currentTarget.value))} className="w-full accent-primary" />
            </div>
            <div className="space-y-2 rounded-lg border border-border bg-background/80 p-3">
              <div className="flex items-center justify-between text-sm font-medium"><span>Compare size</span><span>{maxCompareSide}px</span></div>
              <input type="range" min={96} max={512} step={32} value={maxCompareSide} onChange={(event) => onMaxCompareSideChange(Number(event.currentTarget.value))} className="w-full accent-primary" />
            </div>
            <label className="flex items-start gap-2 rounded-lg border border-border bg-background/80 p-3 text-sm text-muted-foreground">
              <input type="checkbox" checked={quickMode} onChange={(event) => onQuickModeChange(event.currentTarget.checked)} className="mt-0.5 accent-primary" />
              <span><span className="block font-medium text-foreground">Quick mode</span><span className="text-xs">Run only the first loaded model for faster responses.</span></span>
            </label>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-border bg-muted/25 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">Model Selection</h3>
            <Badge variant="outline">{selectedModelIds.length} selected</Badge>
          </div>
          <p className="text-xs text-muted-foreground">Maximum selected models: {MODEL_SELECTION_MAX_MODELS}.</p>
          <div className="rounded-lg border border-border bg-background/80 p-3">
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={customModelId}
                onChange={(event) => {
                  onCustomModelIdChange(event.currentTarget.value)
                  if (customModelError) {
                    onClearCustomModelError()
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    onAddCustomModel()
                  }
                }}
                placeholder="Xenova/your-model-id"
                className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button type="button" variant="outline" onClick={onAddCustomModel} className="sm:w-auto">Add model</Button>
            </div>
            {customModelError ? <p className="mt-2 text-xs text-destructive">{customModelError}</p> : null}
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {selectableModelEntries.map((entry) => {
              const checked = selectedModelIds.includes(entry.id)
              const isLoaded = loadedModelIds.includes(entry.id)
              const runtimeStatus =
                modelRuntimeStatuses[entry.id] ??
                ({
                  modelId: entry.id,
                  phase: isLoaded ? "ready" : "idle",
                  sizeBytes: null,
                  sizeSource: "unknown",
                  error: null,
                  updatedAt: 0,
                } satisfies ModelRuntimeStatus)
              const progress = modelDownloadProgress[entry.id]
              return (
                <label key={entry.id} className={`flex cursor-pointer flex-col gap-2 rounded-lg border p-3 transition-colors ${checked ? "border-primary/50 bg-primary/5" : "border-border bg-background/80"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1 accent-primary" checked={checked} onChange={(event) => onToggleModel(entry.id, event.currentTarget.checked)} />
                      <div>
                        <p className="text-sm font-medium text-foreground">{entry.label}</p>
                        <p className="text-xs text-muted-foreground">{entry.notes}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant="outline" className={modelPhaseBadgeClass(runtimeStatus.phase)}>{runtimeStatus.phase}</Badge>
                      <Badge variant="outline" className="border-border text-muted-foreground">{formatBytes(runtimeStatus.sizeBytes)}</Badge>
                    </div>
                  </div>
                  {runtimeStatus.error ? <p className="text-xs text-destructive">{runtimeStatus.error}</p> : null}
                  {typeof progress?.progress === "number" && runtimeStatus.phase !== "ready" ? <p className="text-xs text-muted-foreground">download {progress.progress.toFixed(0)}%</p> : null}
                </label>
              )
            })}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="space-y-2 rounded-xl border border-border bg-muted/25 p-4 text-xs">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">Score Formula</h3>
            <p className="text-muted-foreground">Hybrid score = ({embeddingWeight.toFixed(2)} x model score) + ({pixelWeight.toFixed(2)} x pixel score)</p>
            <p className="text-muted-foreground">Runtime: <span className="text-foreground">{MODEL_CONFIG.runtime}</span> | Aggregation: <span className="text-foreground">{MODEL_CONFIG.aggregation}</span></p>
            {runtimeInfo ? <p className="rounded border border-emerald-500/35 bg-emerald-500/10 px-2 py-1 text-emerald-700 dark:text-emerald-300">{runtimeInfo}</p> : null}
            {failedModelMessages.length ? (
              <div className="space-y-1 rounded border border-destructive/35 bg-destructive/10 p-2 text-destructive">
                <p className="font-medium">Model warnings:</p>
                {failedModelMessages.map((message) => (
                  <p key={message}>{message}</p>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <Button variant="outline" onClick={onInitWorkerModels}>Reinitialize models</Button>
            <Button variant="outline" onClick={onClearRuntimeCache}>Clear runtime cache</Button>
            <Button variant="outline" onClick={onAddCurrentPairToBenchmark} disabled={isComparing || isRunningBenchmark}>Add pair to benchmark</Button>
            <Button onClick={onRunCompare} disabled={!canCompare}>{isComparing ? "Comparing..." : "Run compare"}</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
