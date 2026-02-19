export type NormalizedBBox = { x: number; y: number; width: number; height: number } // 0..1
export type PixelBBox = { x: number; y: number; width: number; height: number }

export type CompareRequest = {
  sourceDataUrl: string // cropped ROI PNG data URL
  targetDataUrl: string // cropped ROI PNG data URL
}

export type CompareResult = {
  embeddingSimilarity: number // 0..1
  pixelSimilarity: number // 0..1
  hybridSimilarity: number // 0..1
}

export type WorkerRequest =
  | { type: "init-model" }
  | { type: "compare"; payload: CompareRequest }

export type WorkerResponse =
  | { type: "model-ready" }
  | { type: "compare-result"; payload: CompareResult }
  | { type: "error"; message: string }
