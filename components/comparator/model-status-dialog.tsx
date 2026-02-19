"use client"

import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatBytes, modelPhaseBadgeClass } from "@/components/comparator/comparator-formatters"
import { modelLabelFromId } from "@/lib/comparator/model-config"
import type { ModelStatusRow } from "@/components/comparator/comparator-types"

type ModelStatusDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  rows: ModelStatusRow[]
}

export function ModelStatusDialog({ open, onOpenChange, rows }: ModelStatusDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          Model status
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-h-[85vh] max-w-4xl overflow-hidden">
        <AlertDialogHeader className="items-start text-left">
          <AlertDialogTitle>Model runtime status</AlertDialogTitle>
          <AlertDialogDescription>
            Live status from model initialization and metadata fetching.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-md border border-border bg-muted/20 px-2 py-1.5 text-xs">
            <p className="text-muted-foreground">Selected</p>
            <p className="font-medium text-foreground">{rows.length}</p>
          </div>
          <div className="rounded-md border border-border bg-muted/20 px-2 py-1.5 text-xs">
            <p className="text-muted-foreground">Ready</p>
            <p className="font-medium text-foreground">
              {rows.filter((entry) => entry.phase === "ready").length}
            </p>
          </div>
          <div className="rounded-md border border-border bg-muted/20 px-2 py-1.5 text-xs">
            <p className="text-muted-foreground">Loading</p>
            <p className="font-medium text-foreground">
              {
                rows.filter(
                  (entry) =>
                    entry.phase === "metadata-loading" || entry.phase === "initializing"
                ).length
              }
            </p>
          </div>
          <div className="rounded-md border border-border bg-muted/20 px-2 py-1.5 text-xs">
            <p className="text-muted-foreground">Errors</p>
            <p className="font-medium text-foreground">
              {rows.filter((entry) => entry.phase === "error").length}
            </p>
          </div>
        </div>
        <div className="overflow-auto rounded-md border border-border">
          <table className="min-w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-muted/70 text-muted-foreground backdrop-blur-sm">
              <tr>
                <th className="px-2 py-2 text-left font-medium">Model</th>
                <th className="px-2 py-2 text-left font-medium">Status</th>
                <th className="px-2 py-2 text-left font-medium">Progress</th>
                <th className="px-2 py-2 text-left font-medium">Size</th>
                <th className="px-2 py-2 text-left font-medium">Source</th>
                <th className="px-2 py-2 text-left font-medium">Updated</th>
                <th className="px-2 py-2 text-left font-medium">Error</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((status) => (
                <tr key={status.modelId} className="border-t border-border/60">
                  <td className="px-2 py-2 align-top text-foreground">
                    {modelLabelFromId(status.modelId)}
                  </td>
                  <td className="px-2 py-2 align-top">
                    <Badge variant="outline" className={modelPhaseBadgeClass(status.phase)}>
                      {status.phase}
                    </Badge>
                  </td>
                  <td className="max-w-[220px] px-2 py-2 align-top text-muted-foreground">
                    {typeof status.progress === "number" ? (
                      <div className="space-y-1">
                        <div className="h-1.5 overflow-hidden rounded bg-muted">
                          <div
                            className="h-full rounded bg-primary"
                            style={{
                              width: `${Math.max(0, Math.min(100, status.progress))}%`,
                            }}
                          />
                        </div>
                        <p>{status.progress.toFixed(0)}%</p>
                        {status.progressFile ? <p className="truncate">{status.progressFile}</p> : null}
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-2 py-2 align-top text-foreground">{formatBytes(status.sizeBytes)}</td>
                  <td className="px-2 py-2 align-top text-muted-foreground">
                    {status.sizeSource === "huggingface-api"
                      ? "huggingface-api"
                      : status.progressTotal
                        ? "transformers-download"
                        : "unknown"}
                  </td>
                  <td className="px-2 py-2 align-top text-muted-foreground">
                    {status.updatedAt ? new Date(status.updatedAt).toLocaleTimeString() : "-"}
                  </td>
                  <td className="max-w-[280px] px-2 py-2 align-top text-destructive">
                    {status.error ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Close</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
