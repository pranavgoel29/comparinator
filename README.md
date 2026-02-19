# Comparinator Playground

Browser-local image region comparator with model-based + pixel-based scoring, benchmark suites, and analytics.

## What This Repo Is

Comparinator lets you:
- compare selected regions between two images
- combine semantic similarity (Transformers.js vision models) with pixel similarity
- run benchmark suites across many saved cases
- track correctness and latency on a dedicated analytics page

No server-side inference is required for core compare/benchmark flows.

## Quick Start

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Core Features

- Dual-image ROI comparison with bbox editor + JSON bbox input
- Hybrid scoring:
  - embedding similarity (model-based)
  - pixel similarity (normalized MAE)
  - weighted hybrid score
- Multi-model support with conservative aggregation
- Speed presets: `Fast`, `Balanced`, `Thorough`
- Model runtime visibility:
  - init status phases
  - download progress
  - model size (when available)
- Benchmark suite:
  - save many cases
  - run pooled comparisons
  - per-case correctness (`match` / `non-match` expected outcome)
- Analytics page (`/analytics`):
  - correctness + latency charts
  - incorrect-comparison breakdown

## Project Structure

- Routes:
  - `/app/page.tsx` comparator
  - `/app/analytics/page.tsx` analytics
- Comparator modules:
  - `/components/comparator/*`
- Worker modules:
  - `/workers/embedding.worker.ts`
  - `/workers/embedding/*`
- Persistence and core utilities:
  - `/lib/comparator/*`

Detailed architecture docs:
- `/ARCHITECTURE.md`

## Runtime and Storage

- Inference runs in Web Workers (UI stays responsive)
- Runtime caches are in-memory per tab/session
- Session state is persisted in IndexedDB:
  - images, bboxes, controls, model selection
  - benchmark cases
  - latest benchmark snapshot
- `Clear runtime cache` clears compute caches
- `Clear saved session` clears persisted browser session

## Quality Gates

```bash
pnpm lint
pnpm build
```

## Security Notes

- Worker payload validation is enforced for compare requests
- Model ID validation + selection limits are enforced
- Metadata fetch is timeout-guarded and non-blocking for model init
- For dependency hygiene in connected environments, run:

```bash
pnpm audit --prod
```

## Known Constraints

- First-time model initialization can be slow due to browser downloads
- Benchmark pools duplicate model memory per worker
- Very large images increase memory pressure; reduce compare size as needed
