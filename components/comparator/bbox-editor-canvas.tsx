"use client"

import * as React from "react"

import {
  clampPixelBBox,
  createDefaultBBox,
  enforceMinimumBoxSize,
  normalizedToPixelBBox,
  pixelToNormalizedBBox,
  roundNormalizedBBox,
} from "@/lib/comparator/bbox"
import { calculateViewportSize } from "@/lib/comparator/image"
import type { NormalizedBBox, PixelBBox } from "@/lib/comparator/types"

type BBoxEditorCanvasProps = {
  image: ImageBitmap | null
  bbox: NormalizedBBox | null
  label: string
  editable?: boolean
  onChange?: (bbox: NormalizedBBox) => void
  minPixels?: number
}

type ResizeHandle = "nw" | "ne" | "sw" | "se"
type DragMode = "draw" | "move" | `resize-${ResizeHandle}`

const HANDLE_RADIUS = 7

function isInsideBox(point: { x: number; y: number }, box: PixelBBox) {
  return (
    point.x >= box.x &&
    point.x <= box.x + box.width &&
    point.y >= box.y &&
    point.y <= box.y + box.height
  )
}

function resolveResizeHandle(
  point: { x: number; y: number },
  box: PixelBBox
): ResizeHandle | null {
  const handles: Array<{ id: ResizeHandle; x: number; y: number }> = [
    { id: "nw", x: box.x, y: box.y },
    { id: "ne", x: box.x + box.width, y: box.y },
    { id: "sw", x: box.x, y: box.y + box.height },
    { id: "se", x: box.x + box.width, y: box.y + box.height },
  ]

  for (const handle of handles) {
    const distance = Math.hypot(point.x - handle.x, point.y - handle.y)
    if (distance <= HANDLE_RADIUS + 2) {
      return handle.id
    }
  }

  return null
}

function drawHandles(ctx: CanvasRenderingContext2D, box: PixelBBox) {
  const points = [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x, y: box.y + box.height },
    { x: box.x + box.width, y: box.y + box.height },
  ]

  ctx.save()
  ctx.fillStyle = "#0a0f1f"
  ctx.strokeStyle = "#67e8f9"
  ctx.lineWidth = 1.5

  for (const point of points) {
    ctx.beginPath()
    ctx.arc(point.x, point.y, HANDLE_RADIUS, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }

  ctx.restore()
}

export function BBoxEditorCanvas({
  image,
  bbox,
  label,
  editable = false,
  onChange,
  minPixels = 24,
}: BBoxEditorCanvasProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const dragStateRef = React.useRef<{
    mode: DragMode
    startPoint: { x: number; y: number }
    startBox: PixelBBox
  } | null>(null)

  const [containerWidth, setContainerWidth] = React.useState(640)

  const viewport = React.useMemo(() => {
    if (!image) {
      return { width: 640, height: 360 }
    }

    return calculateViewportSize(image, containerWidth, {
      maxWidth: 760,
      maxHeight: 500,
    })
  }, [containerWidth, image])

  React.useEffect(() => {
    if (!editable || !image || bbox || !onChange) {
      return
    }

    onChange(createDefaultBBox())
  }, [bbox, editable, image, onChange])

  React.useEffect(() => {
    if (!containerRef.current) {
      return
    }

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width) {
        setContainerWidth(Math.round(width))
      }
    })

    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    canvas.width = viewport.width
    canvas.height = viewport.height

    const context = canvas.getContext("2d")
    if (!context) {
      return
    }

    context.clearRect(0, 0, canvas.width, canvas.height)

    if (!image) {
      context.fillStyle = "#020617"
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.fillStyle = "#64748b"
      context.font = "600 13px ui-sans-serif"
      context.fillText("Upload image to begin", 16, 28)
      return
    }

    try {
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
    } catch {
      context.fillStyle = "#020617"
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.fillStyle = "#fca5a5"
      context.font = "600 13px ui-sans-serif"
      context.fillText("Image rendering unavailable", 16, 28)
      return
    }

    if (!bbox) {
      return
    }

    const box = normalizedToPixelBBox(bbox, {
      width: canvas.width,
      height: canvas.height,
    })

    context.save()
    context.strokeStyle = editable ? "#67e8f9" : "#fdba74"
    context.lineWidth = 2
    context.setLineDash([10, 6])
    context.strokeRect(box.x, box.y, box.width, box.height)
    context.setLineDash([])

    context.strokeStyle = "rgba(148, 163, 184, 0.35)"
    context.lineWidth = 1
    context.beginPath()
    context.moveTo(box.x + box.width / 2, box.y)
    context.lineTo(box.x + box.width / 2, box.y + box.height)
    context.moveTo(box.x, box.y + box.height / 2)
    context.lineTo(box.x + box.width, box.y + box.height / 2)
    context.stroke()
    context.fillStyle = editable
      ? "rgba(103, 232, 249, 0.08)"
      : "rgba(253, 186, 116, 0.08)"
    context.fillRect(box.x, box.y, box.width, box.height)
    context.restore()

    if (editable) {
      drawHandles(context, box)
    }

    context.save()
    context.fillStyle = "rgba(2, 6, 23, 0.74)"
    context.fillRect(10, 10, 220, 30)
    context.fillStyle = "#e2e8f0"
    context.font = "600 12px ui-sans-serif"
    context.fillText(label, 18, 29)
    context.restore()
  }, [bbox, editable, image, label, viewport.height, viewport.width])

  const updateFromPixelBox = React.useCallback(
    (nextBox: PixelBBox) => {
      if (!image || !onChange) {
        return
      }

      const minWidth = (minPixels / image.width) * viewport.width
      const minHeight = (minPixels / image.height) * viewport.height

      const clamped = clampPixelBBox(
        nextBox,
        viewport.width,
        viewport.height,
        Math.max(2, minWidth),
        Math.max(2, minHeight)
      )

      const normalized = pixelToNormalizedBBox(clamped, {
        width: viewport.width,
        height: viewport.height,
      })

      const constrained = enforceMinimumBoxSize(normalized, {
        width: image.width,
        height: image.height,
      }, minPixels)

      onChange(roundNormalizedBBox(constrained))
    },
    [image, minPixels, onChange, viewport.height, viewport.width]
  )

  const getPointer = React.useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const rect = event.currentTarget.getBoundingClientRect()
      const x =
        ((event.clientX - rect.left) / rect.width) * event.currentTarget.width
      const y =
        ((event.clientY - rect.top) / rect.height) * event.currentTarget.height

      return { x, y }
    },
    []
  )

  const onPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!editable || !image || !onChange) {
        return
      }

      const point = getPointer(event)
      const currentBox = bbox
        ? normalizedToPixelBBox(bbox, {
            width: viewport.width,
            height: viewport.height,
          })
        : null

      let mode: DragMode = "draw"
      let startBox: PixelBBox = {
        x: point.x,
        y: point.y,
        width: 1,
        height: 1,
      }

      if (currentBox) {
        const handle = resolveResizeHandle(point, currentBox)
        if (handle) {
          mode = `resize-${handle}`
          startBox = currentBox
        } else if (isInsideBox(point, currentBox)) {
          mode = "move"
          startBox = currentBox
        }
      }

      dragStateRef.current = {
        mode,
        startPoint: point,
        startBox,
      }

      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [bbox, editable, getPointer, image, onChange, viewport.height, viewport.width]
  )

  const onPointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const dragState = dragStateRef.current
      if (!dragState) {
        return
      }

      const point = getPointer(event)
      const dx = point.x - dragState.startPoint.x
      const dy = point.y - dragState.startPoint.y

      const { mode, startBox } = dragState
      let next: PixelBBox = startBox

      if (mode === "draw") {
        next = {
          x: Math.min(dragState.startPoint.x, point.x),
          y: Math.min(dragState.startPoint.y, point.y),
          width: Math.abs(point.x - dragState.startPoint.x),
          height: Math.abs(point.y - dragState.startPoint.y),
        }
      }

      if (mode === "move") {
        next = {
          ...startBox,
          x: startBox.x + dx,
          y: startBox.y + dy,
        }
      }

      if (mode === "resize-nw") {
        next = {
          x: startBox.x + dx,
          y: startBox.y + dy,
          width: startBox.width - dx,
          height: startBox.height - dy,
        }
      }

      if (mode === "resize-ne") {
        next = {
          x: startBox.x,
          y: startBox.y + dy,
          width: startBox.width + dx,
          height: startBox.height - dy,
        }
      }

      if (mode === "resize-sw") {
        next = {
          x: startBox.x + dx,
          y: startBox.y,
          width: startBox.width - dx,
          height: startBox.height + dy,
        }
      }

      if (mode === "resize-se") {
        next = {
          x: startBox.x,
          y: startBox.y,
          width: startBox.width + dx,
          height: startBox.height + dy,
        }
      }

      updateFromPixelBox(next)
    },
    [getPointer, updateFromPixelBox]
  )

  const onPointerUp = React.useCallback(() => {
    dragStateRef.current = null
  }, [])

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-xl border border-border bg-muted/20 p-3"
    >
      <canvas
        ref={canvasRef}
        className="relative w-full rounded-md border border-border bg-background touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      />
    </div>
  )
}
