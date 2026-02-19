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
}

function prettyPrintBBoxJson(value: MinMaxBBox) {
  return JSON.stringify(value, null, 2)
}

export function BBoxJsonEditor({
  title,
  bbox,
  dimensions,
  onApply,
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
        <p className="text-[11px] text-muted-foreground">left/top/right/bottom</p>
      </div>

      <Textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={`{\n  "minX": 958,\n  "minY": 1151,\n  "maxX": 1133,\n  "maxY": 1255\n}`}
        className="min-h-32 border-border bg-background font-mono text-xs text-foreground placeholder:text-muted-foreground"
      />

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={applyJson}>
          Apply JSON
        </Button>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/35 bg-destructive/10 px-2 py-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
