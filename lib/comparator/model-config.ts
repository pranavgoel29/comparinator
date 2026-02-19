export type ModelCatalogEntry = {
  id: string
  label: string
  notes: string
}

export const MODEL_CATALOG: ModelCatalogEntry[] = [
  {
    id: "Xenova/clip-vit-base-patch32",
    label: "CLIP Base Patch32",
    notes: "Fast baseline; decent general semantic matching.",
  },
  {
    id: "Xenova/clip-vit-base-patch16",
    label: "CLIP Base Patch16",
    notes: "Finer patch granularity; often stricter on local detail.",
  },
  {
    id: "Xenova/clip-vit-large-patch14",
    label: "CLIP Large Patch14",
    notes: "Larger CLIP backbone; slower but can be more discriminative.",
  },
  {
    id: "Xenova/siglip-base-patch16-224",
    label: "SigLIP Base Patch16",
    notes: "Alternative vision-language model; useful as a second opinion.",
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
    "Xenova/clip-vit-base-patch32",
    "Xenova/clip-vit-base-patch16",
  ],
  minRoiPixels: 24,
  hybridWeights: {
    embedding: 0.35,
    pixel: 0.65,
  },
} as const
