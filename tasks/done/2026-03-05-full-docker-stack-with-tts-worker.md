# Full Docker Stack with TTS Worker

**Date**: 2026-03-05
**Commit**: `cdc82f7`

## Key Fixes

- **Replaced deprecated `TTS==0.22.0`** (Coqui, project shut down) with `coqui-tts>=0.27.5` (Idiap fork, actively maintained). Same `from TTS.api import TTS` import path — drop-in compatible.

- **Split requirements**: `requirements.txt` (API server, no ML deps) + `requirements-worker.txt` (TTS + PyTorch). Keeps API image light (~200MB), worker image heavier (~4GB).

- **Added `Dockerfile.worker`** with `build-essential` (needed for `monotonic-alignment-search` C extension) and `git`.

- **Pinned `transformers>=4.57,<5.0`** — `coqui-tts 0.27.5` requires `>=4.57`, but `transformers 5.x` removed `isin_mps_friendly` causing `ImportError`.

- **Pinned `torch<2.9`** — PyTorch 2.9+ requires `torchcodec` which has no `aarch64` Linux wheels.

- **Added PostgreSQL healthcheck** in `docker-compose.yml` — backend/worker previously crashed with `ConnectionRefusedError` when starting before PG was ready.

- **Standardized API port to 9000** across: `Dockerfile`, `docker-compose.yml`, all frontend `API_BASE` defaults, `.env.local`, `.env.example`.

- **Cleaned up CORS** — removed stale `8001` origins from `main.py`.

## Architecture

```
docker compose up  →  5 services

frontend   :3000  (Next.js)
backend    :9000  (FastAPI, no TTS deps)
worker            (ARQ + coqui-tts, CPU mode)
postgres   :5433  (healthcheck-gated)
redis      :6379
```
