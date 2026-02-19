export function isRecord(input: unknown): input is Record<string, unknown> {
  return Boolean(input) && typeof input === "object"
}

export function toFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

export function toNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null
}

export function toBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null
}

export function toUint8ClampedArray(value: unknown) {
  if (value instanceof Uint8ClampedArray) {
    return new Uint8ClampedArray(value)
  }

  if (Array.isArray(value)) {
    return new Uint8ClampedArray(value)
  }

  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView
    const copied = view.buffer.slice(
      view.byteOffset,
      view.byteOffset + view.byteLength
    )
    return new Uint8ClampedArray(copied)
  }

  return null
}
