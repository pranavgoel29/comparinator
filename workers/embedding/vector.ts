function viewToNumberArray(view: ArrayBufferView): number[] {
  if ("length" in view) {
    return Array.from(view as unknown as ArrayLike<number>)
  }

  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
  return Array.from(bytes)
}

export function toVector(output: unknown): number[] {
  const tensorLike = output as { data?: unknown; tolist?: () => unknown }

  if (tensorLike?.data && ArrayBuffer.isView(tensorLike.data)) {
    return viewToNumberArray(tensorLike.data)
  }

  if (ArrayBuffer.isView(output)) {
    return viewToNumberArray(output)
  }

  if (Array.isArray(output)) {
    return output.flat(Infinity) as number[]
  }

  if (typeof tensorLike?.tolist === "function") {
    const list = tensorLike.tolist()
    if (Array.isArray(list)) {
      return list.flat(Infinity) as number[]
    }
  }

  throw new Error("Unsupported embedding output format.")
}
