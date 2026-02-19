import type { CompareWeights } from "@/lib/comparator/types"

export function nowMs() {
  return performance.now()
}

export function elapsedMs(started: number) {
  return Math.max(0, Math.round(nowMs() - started))
}

export function hashBytes(bytes: Uint8ClampedArray) {
  let hash = 2166136261
  for (let index = 0; index < bytes.length; index += 1) {
    hash ^= bytes[index]
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export function getCachedValue<T>(cache: Map<string, T>, key: string) {
  const value = cache.get(key)
  if (value === undefined) {
    return undefined
  }

  cache.delete(key)
  cache.set(key, value)
  return value
}

export function setCachedValue<T>(
  cache: Map<string, T>,
  key: string,
  value: T,
  limit: number
) {
  if (cache.has(key)) {
    cache.delete(key)
  }
  cache.set(key, value)

  while (cache.size > limit) {
    const oldestKey = cache.keys().next().value
    if (typeof oldestKey === "string") {
      cache.delete(oldestKey)
      continue
    }
    break
  }
}

export function normalizeWeights(input: CompareWeights): CompareWeights {
  const embedding = Number.isFinite(input.embedding)
    ? Math.max(0, input.embedding)
    : 0
  const pixel = Number.isFinite(input.pixel) ? Math.max(0, input.pixel) : 0

  if (embedding === 0 && pixel === 0) {
    return { embedding: 0.5, pixel: 0.5 }
  }

  return { embedding, pixel }
}
