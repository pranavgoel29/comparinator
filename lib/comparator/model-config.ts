export type ModelCatalogEntry = {
  id: string
  label: string
  notes: string
}

export const MODEL_CATALOG: ModelCatalogEntry[] = [
  {
    id: "Xenova/siglip-base-patch16-224",
    label: "SigLIP Base Patch16",
    notes: "Newer than CLIP; strong default semantic signal at moderate cost.",
  },
  {
    id: "onnx-community/siglip2-base-patch16-224-ONNX",
    label: "SigLIP2 Base Patch16 (224)",
    notes: "Next-gen SigLIP2 variant; usually stronger but slower and larger.",
  },
  {
    id: "Xenova/dinov2-small",
    label: "DINOv2 Small",
    notes: "Modern self-supervised vision encoder; useful for structure-focused matches.",
  },
  {
    id: "Xenova/clip-vit-base-patch32",
    label: "CLIP Base Patch32",
    notes: "Legacy baseline; very fast but often less discriminative than newer models.",
  },
  {
    id: "Xenova/clip-vit-base-patch16",
    label: "CLIP Base Patch16",
    notes: "Legacy baseline with finer patches; still useful as a fallback check.",
  },
  {
    id: "Xenova/clip-vit-large-patch14",
    label: "CLIP Large Patch14",
    notes: "Legacy larger CLIP backbone; slower but occasionally useful as a tie-breaker.",
  },
  {
    id: "Xenova/clip-vit-large-patch14-336",
    label: "CLIP Large Patch14 (336)",
    notes: "Higher-resolution CLIP variant for fine-detail matching; highest cost.",
  },
]

export function modelLabelFromId(modelId: string) {
  const match = MODEL_CATALOG.find((entry) => entry.id === modelId)
  return match ? match.label : modelId
}

export const MODEL_CONFIG = {
  task: "image-feature-extraction",
  quantized: true,
  runtime: "Transformers.js in Web Worker",
  aggregation: "minimum-across-models",
  defaultModelIds: [
    "Xenova/siglip-base-patch16-224",
    "onnx-community/siglip2-base-patch16-224-ONNX",
  ],
  minRoiPixels: 24,
  hybridWeights: {
    embedding: 0.35,
    pixel: 0.65,
  },
} as const
