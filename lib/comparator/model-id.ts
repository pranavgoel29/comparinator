export const MODEL_ID_MAX_LENGTH = 120
export const MODEL_SELECTION_MAX_MODELS = 12

const MODEL_ID_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/

export function normalizeModelId(input: string) {
  return input.trim()
}

export function validateModelId(modelId: string): string | null {
  const normalized = normalizeModelId(modelId)
  if (!normalized) {
    return "Enter a model ID."
  }

  if (normalized.length > MODEL_ID_MAX_LENGTH) {
    return `Model ID must be ${MODEL_ID_MAX_LENGTH} characters or fewer.`
  }

  if (!MODEL_ID_PATTERN.test(normalized)) {
    return "Use owner/repo format with letters, numbers, dot, underscore, or hyphen."
  }

  return null
}

export function normalizeUniqueModelIds(modelIds: string[]) {
  const seen = new Set<string>()
  const result: string[] = []

  for (const raw of modelIds) {
    const normalized = normalizeModelId(raw)
    if (!normalized || seen.has(normalized)) {
      continue
    }
    seen.add(normalized)
    result.push(normalized)
  }

  return result
}

export function validateModelSelectionCount(modelIds: string[]) {
  return modelIds.length <= MODEL_SELECTION_MAX_MODELS
}
