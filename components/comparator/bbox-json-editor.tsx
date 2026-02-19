"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  minMaxBBoxToNormalized,
  normalizedToMinMaxBBox,
  type MinMaxBBox,
} from "@/lib/comparator/bbox"
import type { NormalizedBBox } from "@/lib/comparator/types"

type BBoxJsonEditorProps = {
  title: string
  bbox: NormalizedBBox | null
  dimensions: { width: number; height: number } | null
  onApply: (bbox: NormalizedBBox) => void
  lockOnUpload: boolean
  onLockOnUploadChange: (next: boolean) => void
}

function prettyPrintBBoxJson(value: MinMaxBBox) {
  return JSON.stringify(value, null, 2)
}

export function BBoxJsonEditor({
  title,
  bbox,
  dimensions,
  onApply,
  lockOnUpload,
  onLockOnUploadChange,
}: BBoxJsonEditorProps) {
  const [value, setValue] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!bbox || !dimensions) {
      return
    }

    const json = normalizedToMinMaxBBox(bbox, dimensions)
    setValue(prettyPrintBBoxJson(json))
  }, [bbox, dimensions])

  const applyJson = React.useCallback(() => {
    if (!dimensions) {
      setError("Upload image first.")
      return
    }

    try {
      const parsed = JSON.parse(value) as MinMaxBBox
      const normalized = minMaxBBoxToNormalized(parsed, dimensions)
      onApply(normalized)
      setError(null)
    } catch (jsonError) {
      setError(
        jsonError instanceof Error ? jsonError.message : "Invalid JSON payload."
      )
    }
  }, [dimensions, onApply, value])

  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {title} Box JSON
        </p>
        <div className="flex items-center gap-2">
          <p className="text-[11px] text-muted-foreground">left/top/right/bottom</p>
          <Button
            type="button"
            variant={lockOnUpload ? "default" : "outline"}
            size="icon-sm"
            aria-label={
              lockOnUpload ? "Unlock JSON input" : "Lock JSON input"
            }
            title={lockOnUpload ? "Unlock JSON input" : "Lock JSON input"}
            onClick={() => onLockOnUploadChange(!lockOnUpload)}
          >
            <span aria-hidden>{lockOnUpload ? "🔒" : "🔓"}</span>
          </Button>
        </div>
      </div>

      <Textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        disabled={lockOnUpload}
        placeholder={`{\n  "minX": 958,\n  "minY": 1151,\n  "maxX": 1133,\n  "maxY": 1255\n}`}
        className="min-h-32 border-border bg-background font-mono text-xs text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-70"
      />

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={applyJson}
          disabled={lockOnUpload}
        >
          Apply JSON
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {lockOnUpload
          ? "Locked: uploading a new image keeps this area instead of resetting."
          : "Unlocked: uploading a new image resets area to default."}
      </p>

      {error ? (
        <p className="rounded-md border border-destructive/35 bg-destructive/10 px-2 py-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
