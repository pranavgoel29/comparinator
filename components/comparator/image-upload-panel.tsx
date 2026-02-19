"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ACCEPTED_IMAGE_MIME_TYPES } from "@/lib/comparator/image"

type ImageUploadPanelProps = {
  title: string
  fileName?: string
  dimensions?: { width: number; height: number } | null
  onSelect: (file: File) => void
  children?: React.ReactNode
}

export function ImageUploadPanel({
  title,
  fileName,
  dimensions,
  onSelect,
  children,
}: ImageUploadPanelProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null)

  return (
    <Card className="border-zinc-800/80 bg-zinc-950/70 text-zinc-100 shadow-[0_10px_35px_rgba(0,0,0,0.45)]">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold tracking-wide text-zinc-100">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_IMAGE_MIME_TYPES.join(",")}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (!file) {
              return
            }

            onSelect(file)
            event.currentTarget.value = ""
          }}
        />

        <Button
          variant="outline"
          className="w-full border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
          onClick={() => inputRef.current?.click()}
        >
          Upload image
        </Button>

        <div className="min-h-12 rounded-md border border-zinc-800 bg-zinc-950/50 p-2 text-xs text-zinc-300">
          {fileName ? (
            <div className="space-y-1">
              <p className="truncate font-medium text-zinc-100">{fileName}</p>
              {dimensions ? (
                <p className="text-zinc-400">
                  {dimensions.width} x {dimensions.height}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-zinc-500">PNG, JPEG, WEBP</p>
          )}
        </div>

        {children}
      </CardContent>
    </Card>
  )
}
