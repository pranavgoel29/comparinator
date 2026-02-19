export type NormalizedBBox = { x: number; y: number; width: number; height: number } // 0..1
export type PixelBBox = { x: number; y: number; width: number; height: number }

export type CompareRequest = {
  sourceDataUrl: string // cropped ROI PNG data URL
  targetDataUrl: string // cropped ROI PNG data URL
  modelIds: string[]
  weights: CompareWeights
}

export type CompareWeights = {
  embedding: number // 0..1
  pixel: number // 0..1
}

export type PerModelScore = {
  modelId: string
  embeddingSimilarity: number // 0..1
  hybridSimilarity: number // 0..1
}

export type CompareResult = {
  embeddingSimilarity: number // 0..1
  pixelSimilarity: number // 0..1
  hybridSimilarity: number // 0..1
  aggregation: "minimum-across-models"
  usedWeights: CompareWeights
  perModelScores: PerModelScore[]
}

export type ModelInitResult = {
  loadedModelIds: string[]
  failedModels: Array<{ modelId: string; error: string }>
}

export type WorkerRequest =
  | { type: "init-model"; payload: { modelIds: string[] } }
  | { type: "compare"; payload: CompareRequest }

export type WorkerResponse =
  | { type: "model-ready"; payload: ModelInitResult }
  | { type: "compare-result"; payload: CompareResult }
  | { type: "error"; message: string }
