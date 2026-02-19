# Comparinator ROI

A browser-local Next.js app for comparing source and target ROIs across two images.

## What it does

- Upload a **source** and **target** image (`png`, `jpeg`, `webp`)
- Draw/resize ROI independently on source and target images
- Optionally edit either ROI via JSON using:
  - `minX`, `minY`, `maxX`, `maxY`
- Compare those two crops using:
  - Multi-model CLIP embedding similarity (`@huggingface/transformers` in a Web Worker)
  - Pixel similarity (normalized MAE)
- Produce a conservative ensemble score (minimum across selected models)
- Tune semantic-vs-pixel weighting in the UI to fit your data
- Evaluate pass/fail using a threshold (default `0.85`)

## Run locally

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Model/caching notes

- The model is loaded client-side via `@huggingface/transformers`.
- You can select multiple models in the UI and compare with a conservative ensemble.
- Available model options now include CLIP Base Patch32, CLIP Base Patch16, CLIP Large Patch14, and SigLIP Base Patch16.
- On first run, model files are downloaded in the browser and then cached by browser storage.
- Comparison runs in a dedicated Web Worker to keep the UI responsive.

## Known limits

- First compare can take noticeable time while model assets download.
- Very large images increase memory use; UI preview scales down for rendering while ROI accuracy is preserved.
- This is a single-pair comparator (no history/batch mode yet).
