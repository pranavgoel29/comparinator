"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ACCEPTED_IMAGE_MIME_TYPES } from "@/lib/comparator/image"

type ImageUploadPanelProps = {
  title: string
  subtitle?: string
  fileName?: string
  dimensions?: { width: number; height: number } | null
  onSelect: (file: File) => void
  children?: React.ReactNode
}

export function ImageUploadPanel({
  title,
  subtitle,
  fileName,
  dimensions,
  onSelect,
  children,
}: ImageUploadPanelProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null)

  return (
    <Card className="border-border bg-card/90 shadow-sm">
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="text-sm font-semibold tracking-wide">{title}</CardTitle>
        {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
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
          type="button"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          className="group h-auto w-full justify-between rounded-lg border-dashed bg-muted/40 px-3 py-3 text-left transition hover:border-primary/60 hover:bg-muted"
        >
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Upload image
          </span>
          <span className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-foreground transition group-hover:border-primary/40 group-hover:text-primary">
            Browse
          </span>
        </Button>

        <div className="min-h-12 rounded-md border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
          {fileName ? (
            <div className="space-y-1">
              <p className="truncate font-medium text-foreground">{fileName}</p>
              {dimensions ? (
                <p>
                  {dimensions.width} x {dimensions.height}
                </p>
              ) : null}
            </div>
          ) : (
            <p>Accepted: PNG, JPEG, WEBP</p>
          )}
        </div>

        {children}
      </CardContent>
    </Card>
  )
}
