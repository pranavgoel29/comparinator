import { HUGGING_FACE_METADATA_TIMEOUT_MS } from "@/workers/embedding/constants"

function buildHfModelMetadataUrl(modelId: string) {
  const [owner, repo] = modelId.split("/")
  return `https://huggingface.co/api/models/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
}

function parseModelSizeBytes(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== "object") {
    return null
  }

  const record = metadata as Record<string, unknown>
  const safetensors = record.safetensors
  if (
    safetensors &&
    typeof safetensors === "object" &&
    typeof (safetensors as Record<string, unknown>).total === "number" &&
    Number.isFinite((safetensors as Record<string, unknown>).total)
  ) {
    return Math.max(0, Math.round((safetensors as Record<string, number>).total))
  }

  const siblings = record.siblings
  if (!Array.isArray(siblings)) {
    return null
  }

  const sizes = siblings
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null
      }
      const size = (entry as Record<string, unknown>).size
      return typeof size === "number" && Number.isFinite(size) && size >= 0
        ? Math.round(size)
        : null
    })
    .filter((value): value is number => value !== null)

  if (!sizes.length) {
    return null
  }

  return sizes.reduce((sum, value) => sum + value, 0)
}

export async function fetchModelSizeBytes(modelId: string) {
  const controller = new AbortController()
  const timeoutId = self.setTimeout(
    () => controller.abort(),
    HUGGING_FACE_METADATA_TIMEOUT_MS
  )

  try {
    const response = await fetch(buildHfModelMetadataUrl(modelId), {
      method: "GET",
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`Metadata request failed (${response.status})`)
    }
    const data = await response.json()
    return parseModelSizeBytes(data)
  } finally {
    self.clearTimeout(timeoutId)
  }
}
