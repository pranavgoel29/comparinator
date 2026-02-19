# Comparinator ROI

A browser-local Next.js app for comparing source and target ROIs across two images.

## What it does

- Upload a **source** and **target** image (`png`, `jpeg`, `webp`)
- Draw/resize ROI independently on source and target images
- Optionally edit either ROI via JSON using:
  - `minX`, `minY`, `maxX`, `maxY`
- Compare those two crops using:
  - CLIP-style embedding similarity (`@huggingface/transformers` in a Web Worker)
  - Pixel similarity (normalized MAE)
- Produce a hybrid score: `0.8 * embedding + 0.2 * pixel`
- Evaluate pass/fail using a threshold (default `0.85`)

## Run locally

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Model/caching notes

- The model is loaded client-side via `@huggingface/transformers`.
- On first run, model files are downloaded in the browser and then cached by browser storage.
- Comparison runs in a dedicated Web Worker to keep the UI responsive.

## Known limits

- First compare can take noticeable time while model assets download.
- Very large images increase memory use; UI preview scales down for rendering while ROI accuracy is preserved.
- This is a single-pair comparator (no history/batch mode yet).
