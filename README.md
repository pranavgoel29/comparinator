<img src="app/icon.svg" width="120" height="120" alt="" />

# Comparinator Playground

**Comparinator** is a browser-local image region comparator that combines vision-model embeddings with pixel-level analysis — no server-side inference required.

Upload two images, draw bounding boxes around regions of interest, and get a hybrid similarity score powered by Transformers.js running entirely in Web Workers. Save comparison cases into benchmark suites, run them in bulk, and review correctness and latency on a dedicated analytics dashboard.

## Quick Start

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## How It Works

Comparinator scores region similarity using two independent signals, then blends them:

| Signal               | Method                                          | Default Weight |
| -------------------- | ----------------------------------------------- | -------------- |
| Embedding similarity | Cosine similarity of vision-model feature vectors | 0.35           |
| Pixel similarity     | 1 - normalized Mean Absolute Error (MAE)        | 0.65           |

When multiple models are selected, the final embedding score uses **conservative aggregation** (minimum across models) so a single weak match doesn't inflate the result.

### Speed Presets

| Preset       | Models                              | Compare Size | Quick Mode |
| ------------ | ----------------------------------- | ------------ | ---------- |
| **Fast**     | DINOv2 Small (1 model)              | 160 px       | On         |
| **Balanced** | SigLIP Base + DINOv2 Small (2 models) | 224 px       | Off        |
| **Thorough** | All catalog models                  | 320 px       | Off        |

## Features

### Region Comparison
- Dual-image upload with visual bounding-box editor and JSON bbox input
- Hybrid scoring with configurable embedding/pixel weights and threshold
- Multi-model support with minimum-across-models aggregation
- Adjustable max compare size to trade off detail vs. speed

### Model Management
- Real-time model initialization phases: metadata fetch, download progress, ready/error
- Model size display (when Hugging Face metadata is available)
- Runtime cache per image pair (pixel) and per model (embeddings)

### Benchmark Suite
- Save current comparison as a named case with an expected outcome (`match` or `non-match`)
- Run all saved cases in bulk via an adaptive worker pool
- Per-case pass/fail results with timing data
- Run snapshot captures threshold, weights, and model IDs at execution time

### Analytics Dashboard (`/analytics`)
- Correctness distribution chart (pass/fail rates)
- Per-model latency chart
- Incorrect-comparison breakdown table

## Model Catalog

| Model | Notes |
| ----- | ----- |
| **SigLIP Base Patch16** | Strong default semantic signal at moderate cost |
| **SigLIP2 Base Patch16 (224)** | Next-gen SigLIP2 variant; usually stronger but slower |
| **DINOv2 Small** | Self-supervised vision encoder; structure-focused matches |
| **CLIP Base Patch32** | Very fast legacy baseline |
| **CLIP Base Patch16** | Finer patches; useful as a fallback check |
| **CLIP Large Patch14** | Larger backbone; slower, occasionally useful as tie-breaker |
| **CLIP Large Patch14 (336)** | Higher-resolution variant for fine-detail matching; highest cost |

All models run quantized via [Transformers.js](https://huggingface.co/docs/transformers.js) inside a Web Worker so the UI thread stays responsive.

## Tech Stack

- **Framework** — Next.js 16 (App Router) + React 19
- **Styling** — Tailwind CSS 4, shadcn/ui (Radix primitives)
- **ML Inference** — @huggingface/transformers (Transformers.js) in Web Workers
- **Charts** — Recharts
- **Persistence** — IndexedDB (browser-native, no backend)
- **Language** — TypeScript 5

## Project Structure

```
app/
  page.tsx                        # Comparator route
  analytics/page.tsx              # Analytics dashboard route
  layout.tsx                      # Root layout

components/
  comparator/
    comparator-app.tsx            # Main orchestrator
    comparator-control-center.tsx # Controls: threshold, weights, models, presets
    image-upload-panel.tsx        # Image upload UI
    bbox-editor-canvas.tsx        # Visual bounding-box editor
    bbox-json-editor.tsx          # JSON bbox input
    results-panel.tsx             # Comparison results display
    model-status-dialog.tsx       # Model init status modal
    benchmark-cases-list.tsx      # Benchmark case management
    benchmark-summary-card.tsx    # Benchmark run statistics
    benchmark-analytics-page.tsx  # Analytics page component
    use-comparator-worker.ts      # Worker lifecycle + message bridge
    use-comparator-session.ts     # Session management composition
    use-session-hydration.ts      # Restore session from IndexedDB
    use-session-persistence.ts    # Debounced autosave
    use-benchmark-suite.ts        # Benchmark task orchestration
  ui/                             # shadcn/ui primitives

workers/
  embedding.worker.ts             # Worker entry point
  embedding/
    compare.ts                    # Hybrid similarity execution
    model-init.ts                 # Model loading pipeline
    validate.ts                   # Payload validation
    cache.ts                      # Runtime caching
    vector.ts                     # Tensor-to-embedding conversion
    metadata.ts                   # HF metadata fetch
    messages.ts                   # Message protocol dispatch
    progress.ts                   # Progress/status posting
    runtime.ts                    # Worker runtime state
    constants.ts                  # Limits and timeouts

lib/comparator/
    model-config.ts               # Model catalog and defaults
    session-store/                # IndexedDB persistence layer
    benchmark-analytics.ts        # Analytics computations
    bbox.ts                       # Bounding-box utilities
    image.ts                      # Image processing utilities
    metrics.ts                    # Metric calculations
```

Full architecture details are in [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Runtime and Storage

All inference runs in **Web Workers** — the UI thread is never blocked by model computation.

| Store | Scope | Contents |
| ----- | ----- | -------- |
| Worker memory cache | Per tab, ephemeral | Image-pair pixel cache, per-model embedding cache |
| IndexedDB session | Per origin, persistent | Images, bboxes, controls, model selection, benchmark cases, latest run snapshot |

- **Clear runtime cache** — resets in-memory compute caches (forces recomputation)
- **Clear saved session** — removes all persisted state from IndexedDB

## Quality Gates

```bash
pnpm lint    # ESLint
pnpm build   # Production build check
```

## Security Notes

- Compare payloads are validated in the worker: integer dimensions, dimension bounds, RGBA length consistency
- Model IDs are validated and selection count is capped
- Hugging Face metadata fetch is timeout-guarded with abort and falls back to unknown size
- The UI never runs model inference directly — the worker boundary isolates heavy compute

## Known Constraints

- First-time model initialization can be slow while the browser downloads model assets
- Benchmark worker pools duplicate model memory per worker
- Very large images increase memory pressure — reduce the max compare size as needed
