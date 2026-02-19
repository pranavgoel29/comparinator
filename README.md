# Comparinator Playground

A browser-local Next.js app for comparing selected areas across images and benchmarking many pairs.

## What it does

- Upload a **source** and **target** image (`png`, `jpeg`, `webp`)
- Draw/resize a selected area independently on source and target images
- Optionally edit either area via JSON using:
  - `minX`, `minY`, `maxX`, `maxY`
- Compare those two crops using:
  - Multi-model vision embedding similarity (`@huggingface/transformers` in a Web Worker)
  - Pixel similarity (normalized MAE)
- Produce a conservative ensemble score (minimum across selected models)
- Tune model-vs-pixel weighting in the UI to fit your data
- Tune speed via compare-size and quick mode controls
- Use speed presets (`Fast`, `Balanced`, `Thorough`) and still tweak controls manually
- Save many pairs and run a benchmark suite in one click
- Select any benchmark case and inspect it in the main Results panel
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
- Defaults now prioritize newer models (SigLIP + SigLIP2) instead of CLIP.
- Available built-in options include SigLIP Base Patch16, SigLIP2 Base Patch16 (224), DINOv2 Small, CLIP Base Patch32, CLIP Base Patch16, CLIP Large Patch14, and CLIP Large Patch14 (336).
- You can also add custom model IDs directly in the UI model selector.
- On first run, model files are downloaded in the browser and then cached by browser storage.
- Full comparator sessions are auto-saved in browser IndexedDB and restored after refresh (images, boxes, controls, model selection, and benchmark cases).
- Restored benchmark cases intentionally reset run outputs (`status`, `scores`, `timings`) so you can rerun against the current runtime state.
- Comparison runs in a dedicated Web Worker to keep the UI responsive.
- Compare payloads are sent to the worker as raw RGBA typed arrays (not base64 data URLs) to reduce serialization overhead.
- Runtime comparison cache is in-memory for the current tab/session:
  - Pixel pair cache
  - Per-model embedding cache
- Benchmark workers are reused across runs for the same model setup, so repeated suites can hit cache instead of recomputing.
- Weight-zero short-circuit is enabled:
  - If embedding weight is `0`, semantic model inference is skipped.
  - If pixel weight is `0`, pixel similarity is skipped.
- Re-running the same benchmark cases is typically faster due to cache hits.
- Use `Clear runtime cache` in the UI when you want cold-run behavior again.
- Use `Clear saved session` in the UI to remove persisted IndexedDB session data.
- Benchmark suite uses an adaptive worker pool (`1..3`) to process cases concurrently.

## Model notes

- SigLIP is a vision-language embedding model trained with a sigmoid matching objective.
- SigLIP2 is a newer SigLIP-family model and is included in the default balanced setup.
- `Fast` preset uses SigLIP-only with smaller compare size to reduce latency.
- `Balanced` preset combines SigLIP and SigLIP2.
- Final similarity still uses your hybrid weighting between model and pixel scores.

## Known limits

- First compare can take noticeable time while model assets download.
- Very large images increase memory use; compare-size control helps cap processing cost.
- Benchmark pool duplicates model memory per worker by design; use fewer models or lower compare size on lower-memory devices.
- Changing model set/preset resets benchmark worker caches for correctness.
- Runtime compute cache is not persisted across tab refreshes; only session inputs/state are persisted.

## Security note

- In connected environments, run `pnpm audit --prod` as part of regular dependency hygiene.
