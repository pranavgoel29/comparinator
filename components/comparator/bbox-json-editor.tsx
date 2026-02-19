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
    <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-950/55 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
        {title} JSON
      </p>
      <Textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={`{\n  "minX": 958,\n  "minY": 1151,\n  "maxX": 1133,\n  "maxY": 1255\n}`}
        className="min-h-32 border-zinc-700 bg-zinc-900 font-mono text-xs text-zinc-100 placeholder:text-zinc-500"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
          onClick={applyJson}
        >
          Apply JSON
        </Button>
      </div>

      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
    </div>
  )
}
