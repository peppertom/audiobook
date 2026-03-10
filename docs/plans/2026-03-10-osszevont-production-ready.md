# Összevont Production-Ready Terv — 2026-03-10

## Kontextus

Az audiobook generáló alkalmazás jelenleg single-user, lokális inferenciával működik (XTTS-v2 MPS-en, Ollama qwen3:30b). A `claude/audiobook-production-research-tmcQo` branchen készen áll: R2 storage, JWT auth + user izoláció, fair queue scheduling, notification rendszer, GPU worker Dockerfile. Ezt a munkát kell összevonni a main-nel, ráépíteni az inference szétválasztást (RunPod TTS + cloud LLM), és production-ready állapotba hozni úgy, hogy **lokálisan is működjön cloud TTS-sel és cloud storage-dzsal**.

### Korábbi tervek, amikből épít

- `docs/plans/2026-03-10-publikus-uzemeltetes-es-gpu-inference-terv.md` — platform stratégia, fázisok, 30-60-90 nap
- `plan/inference-platform-research.md` — modell benchmark, inference client design, provider absztrakció

---

## Architektúra döntések

### 1. TTS inference: Worker → RunPod Direct API (nincs külön inference gateway)
- Az ARQ worker közvetlenül hívja a RunPod serverless API-t egy `InferenceClient` absztrakción keresztül
- Külön inference gateway service nem kell — overhead nélkül, a worker kódbázisban oldható meg
- `AUDIOBOOK_INFERENCE_PROVIDER=local|runpod` env var vezérli

### 2. Summary LLM: Ollama lokálban, OpenAI-compatible API productionben
- `AUDIOBOOK_LLM_PROVIDER=ollama|openai_compatible`
- Production: Together.ai / RunPod / bármely OpenAI-kompatibilis endpoint
- Lokál: Ollama marad (qwen3:30b Metal GPU-n)

### 3. Deployment topológia
- **Railway**: Frontend (Next.js) + Backend API (FastAPI) + Queue Worker (ARQ, könnyű, nincs GPU)
- **RunPod Serverless**: TTS endpoint (XTTS-v2, pre-baked model image)
- **Upstash**: Redis (TLS, queue)
- **Railway Add-on**: PostgreSQL
- **Cloudflare R2**: Object storage (audio, cover, reference clips)

### 4. Lokál dev: hybrid mód
- `AUDIOBOOK_INFERENCE_PROVIDER=local` → minden lokálban (mai állapot)
- `AUDIOBOOK_INFERENCE_PROVIDER=runpod` + R2 env vars → lokál backend, cloud TTS + cloud storage

### 5. Auth: email/password JWT (OAuth stub későbbre)
- Branch auth rendszere production-viable (auto-user-creation, per-user isolation)
- Kiegészítés: refresh token rotáció, rate limiting, JWT secret validation

---

## Fázis 1: Branch merge + reconciliation (3–5 nap)

### 1.1 Branch merge és conflict resolution

Új branch: `feat/production-deploy` a `main`-ből, merge `origin/claude/audiobook-production-research-tmcQo`.

**Conflict resolution mátrix:**

| Fájl | Stratégia |
|------|-----------|
| `backend/app/config.py` | Branch struktúra (cors list, resend, email_from) + main mezők visszaadása (`ollama_url`, `ollama_model`) |
| `backend/app/worker.py` | Branch verzió (R2, notifications, auto-advance) + main kód visszaadása (emotion bank ref clip selection, LLM annotator hívások) |
| `backend/app/services/llm_annotator.py` | Main verzió (generate_summary + analyze_chapter_arc + think:False) |
| `backend/app/models.py` | Branch modellek (Notification, user_id NOT NULL, relationships) + main modellek visszaadása (ReadingState, Chapter.segments/emotional_arc/summary) |
| `backend/app/routers/books.py` | Branch user-isolation pattern + main summary/segments endpointok visszaadása |
| `backend/app/main.py` | Branch verzió + reading router import visszaadása |

### 1.2 Branch által törölt feature-ök visszaadása user-isolation-nel

- `backend/app/routers/reading.py` — `user=Depends(get_current_user)` hozzáadása
- `backend/app/services/text_normalizer.py` — megtartás main-ből
- Emotion bank endpointok `voices.py`-ban — megtartás + user isolation
- Frontend komponensek értékelése: melyek kellenek (reading mode, player, stb.)

### 1.3 Alembic migration reconciliation

- Branch migrációk megtartása: `001_user_id_not_null`, `002_notifications`
- Új `003_reading_state_segments.py` ha szükséges a schema különbségek miatt
- `create_all` dev kényelemnek marad, Alembic a production migration path

### 1.4 Docker compose frissítés

Branch `docker-compose.yml` + hiányzó env vars:
```yaml
worker:
  environment:
    - AUDIOBOOK_OLLAMA_URL=http://host.docker.internal:11434
    - AUDIOBOOK_OLLAMA_MODEL=qwen3:30b
```

**Verifikáció:**
- [ ] `docker compose up` elindul
- [ ] Lokál worker MPS-en fut
- [ ] Regisztráció, könyvfeltöltés, voice, job indítás működik
- [ ] Job befejezés → notification megjelenik
- [ ] Fair queue: 2 user, interleaved jobs

---

## Fázis 2: Inference client absztrakció (3–4 nap)

### 2.1 Inference client service — ÚJ FÁJL

`backend/app/services/inference_client.py`:

```python
class InferenceClient(Protocol):
    async def generate_tts(self, text, reference_clip_url, language, output_key, on_progress) -> tuple[str, list[dict]]: ...

class LocalTTSClient:
    """Wraps existing TTSEngine for local inference."""

class RunPodTTSClient:
    """Calls RunPod serverless endpoint via HTTP."""
```

**RunPodTTSClient** működése:
1. HTTP POST → RunPod serverless endpoint (text, ref clip R2 URL, params)
2. Poll for completion (RunPod async job pattern)
3. RunPod endpoint: XTTS-v2 futtatás → R2 upload → visszaadja az R2 key-t + timing data-t

### 2.2 RunPod handler — ÚJ KÖNYVTÁR

`runpod/` a project rootban:

| Fájl | Tartalom |
|------|----------|
| `runpod/handler.py` | RunPod serverless handler: text → XTTS-v2 → R2 upload |
| `runpod/Dockerfile` | Branch `Dockerfile.worker.gpu` alapján, handler CMD-vel |
| `runpod/requirements.txt` | TTS dependencies |

Handler flow: R2-ről letölti a ref clipet → XTTS-v2 inference → EBU R128 normalizálás → R2-re feltölti → visszaadja URL + timing data.

### 2.3 Config bővítés

`backend/app/config.py` — új mezők:
```python
inference_provider: str = "local"        # "local" | "runpod"
runpod_api_key: str | None = None
runpod_tts_endpoint_id: str | None = None
runpod_timeout_s: int = 600

llm_provider: str = "ollama"             # "ollama" | "openai_compatible"
llm_api_base: str | None = None
llm_api_key: str | None = None
llm_model: str | None = None
```

### 2.4 LLM annotator dual provider

`backend/app/services/llm_annotator.py` módosítás:
- `__init__` kap `provider` paramétert
- Új `_call_openai_compatible()` metódus (httpx, OpenAI chat completions API)
- `_call_llm()` route-ol: `ollama` → `_call_ollama()`, `openai_compatible` → `_call_openai_compatible()`

### 2.5 Worker módosítás

`backend/app/worker.py`:
- `startup()`: `settings.inference_provider` alapján `LocalTTSClient` vagy `RunPodTTSClient`
- `startup()`: `settings.llm_provider` alapján `LLMAnnotator` config
- `generate_tts()`: `ctx["inference_client"]` használata `ctx["tts_engine"]` helyett

**Verifikáció:**
- [ ] `AUDIOBOOK_INFERENCE_PROVIDER=local` → minden mint eddig
- [ ] `AUDIOBOOK_INFERENCE_PROVIDER=runpod` → worker RunPodot hívja, audio R2-ben
- [ ] `AUDIOBOOK_LLM_PROVIDER=openai_compatible` → summary cloud LLM-ből
- [ ] Progress tracking működik RunPod polling-gal

---

## Fázis 3: Production deployment konfiguráció (2–3 nap)

### 3.1 Railway deployment

3 Railway service:
1. **frontend** — `node .next/standalone/server.js`, port 3000
2. **backend** — `uvicorn app.main:app --workers 2`, port 9000
3. **worker** — `python -m arq app.worker.WorkerSettings`, no port

### 3.2 Production env template

`.env.production.example`:
```env
AUDIOBOOK_DATABASE_URL=postgresql+asyncpg://...       # Railway managed
AUDIOBOOK_REDIS_URL=rediss://...                       # Upstash TLS
AUDIOBOOK_JWT_SECRET=<64-char-random>
AUDIOBOOK_CORS_ORIGINS=["https://audiobook.app"]
AUDIOBOOK_INFERENCE_PROVIDER=runpod
AUDIOBOOK_RUNPOD_API_KEY=...
AUDIOBOOK_RUNPOD_TTS_ENDPOINT_ID=...
AUDIOBOOK_LLM_PROVIDER=openai_compatible
AUDIOBOOK_LLM_API_BASE=https://api.together.xyz/v1
AUDIOBOOK_LLM_API_KEY=...
AUDIOBOOK_LLM_MODEL=meta-llama/Llama-3.1-70B-Instruct
R2_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=audiobook-prod
R2_PUBLIC_URL=https://cdn.audiobook.app
AUDIOBOOK_RESEND_API_KEY=...
```

### 3.3 Health endpointok

`GET /health/live` — always 200
`GET /health/ready` — DB + Redis connection check

### 3.4 Dockerfile production mód

`backend/Dockerfile`: build arg vagy `ENVIRONMENT` env var → `--reload` csak dev-ben.

### 3.5 RunPod serverless deploy

1. `runpod/Dockerfile` build + push GHCR-re
2. RunPod endpoint létrehozás (min_workers=0, max_workers=2, idle_timeout=300s)
3. Endpoint ID → env var

**Verifikáció:**
- [ ] Railway staging deploy működik
- [ ] Frontend load, register/login
- [ ] Könyvfeltöltés → R2
- [ ] Job → RunPod → audio R2-ben
- [ ] Lejátszás R2 public URL-ről
- [ ] Notification megjelenik

---

## Fázis 4: Hardening (2–3 nap)

### 4.1 Rate limiting
- `slowapi`: auth 10 req/min/IP, upload 5 req/min/user, job creation 20 req/min/user

### 4.2 Refresh token rotáció
- Access token: 15 perc, Refresh token: 7 nap (DB-ben)
- `POST /api/auth/refresh` endpoint

### 4.3 Production logging
- Strukturált JSON log (backend + worker)
- `request_id` middleware trace correlation-höz
- Inference hívások logolása: provider, model, latency, input/output size

### 4.4 Circuit breaker
- `RunPodTTSClient`: exponential backoff (3 retry), circuit breaker (5 consecutive failure → 60s cooldown)

### 4.5 Alembic CI/CD
- Railway pre-deploy: `alembic upgrade head`
- JWT secret validation: startup fail ha default érték + `ENVIRONMENT=production`

---

## Fázis 5: Lokál dev hybrid dokumentáció (1 nap)

### 3 fejlesztési mód

1. **Teljesen lokál**: `make dev` — MPS TTS, Ollama LLM, lokál filesystem
2. **Hybrid**: `.env`-ben RunPod + R2 bekapcsolva — lokál backend, cloud TTS/storage
3. **Docker**: `docker compose up` — minden konténerben

### .env.local.example

```env
AUDIOBOOK_DATABASE_URL=postgresql+asyncpg://audiobook:audiobook_dev@localhost:5433/audiobook
AUDIOBOOK_REDIS_URL=redis://localhost:6379
AUDIOBOOK_JWT_SECRET=dev-secret-change-in-production
AUDIOBOOK_OLLAMA_URL=http://localhost:11434
AUDIOBOOK_OLLAMA_MODEL=qwen3:30b
AUDIOBOOK_INFERENCE_PROVIDER=local
AUDIOBOOK_LLM_PROVIDER=ollama

# Hybrid mód (uncomment):
# AUDIOBOOK_INFERENCE_PROVIDER=runpod
# AUDIOBOOK_RUNPOD_API_KEY=...
# AUDIOBOOK_RUNPOD_TTS_ENDPOINT_ID=...
# R2_ENDPOINT_URL=...
# R2_ACCESS_KEY_ID=...
# R2_SECRET_ACCESS_KEY=...
# R2_BUCKET_NAME=audiobook-dev
# R2_PUBLIC_URL=...
```

---

## Fájl összefoglaló

### Új fájlok

| Fájl | Cél |
|------|-----|
| `backend/app/services/inference_client.py` | TTS provider absztrakció (local vs RunPod) |
| `runpod/handler.py` | RunPod serverless handler (XTTS-v2) |
| `runpod/Dockerfile` | GPU container RunPod-hoz |
| `runpod/requirements.txt` | TTS dependencies |
| `.env.production.example` | Production env template |
| `.env.local.example` | Lokál dev env template |

### Módosítandó fájlok

| Fájl | Változás |
|------|----------|
| `backend/app/config.py` | inference_provider, runpod_*, llm_provider, llm_* mezők |
| `backend/app/worker.py` | inference_client absztrakció használata |
| `backend/app/services/llm_annotator.py` | openai_compatible provider support |
| `backend/app/main.py` | health/ready endpoint |
| `backend/Dockerfile` | production CMD (no --reload) |
| `docker-compose.yml` | inference env vars |
| `Makefile` | dev-cloud target |

### Branch-ről átvett fájlok (merge)

| Fájl | Forrás |
|------|--------|
| `backend/app/services/storage.py` | R2 + local fallback |
| `backend/app/auth.py` | JWT + auto-user-creation |
| `backend/app/services/notifications.py` | In-app + email notifications |
| `backend/app/routers/notifications.py` | Notification API |
| `Dockerfile.worker.gpu` | RunPod GPU worker alap |
| `alembic/` | Migration framework |

---

## Kockázatok

1. **RunPod cold start**: 30–60s első kérésnél → min_workers=1 production-ben, vagy UX-ben jelezzük
2. **Branch merge komplexitás**: 81 fájl, intentional törlések → manuális review szükséges
3. **WAV méret R2-ben**: ~50MB/fejezet → MP3/Opus konverzió post-processing-ben
4. **Summary sync vs async**: könyvfeltöltéskor sync LLM hívás → timeout risk productionben → async queue-ba tenni
5. **JWT secret dev default**: startup validation production-ben kötelező

---

---

# TASK LISTA

A feladatok függőségi sorrend szerint rendezve. Független feladatok előre, függő feladatok utánuk. Minden fázisnál először a független taskok, utána az egymásra épülők.

---

## FÁZIS 1: Branch merge + reconciliation

### Független feladatok (párhuzamosítható)

- [ ] **T1.1** — `storage.py` áthozása branch-ről main-re
  - Fájl: `backend/app/services/storage.py`
  - Forrás: branch `storage.py` (R2 + local fallback, boto3)
  - Nincs conflict, nem létezik main-en

- [ ] **T1.2** — `notifications.py` service + router áthozása
  - Fájlok: `backend/app/services/notifications.py`, `backend/app/routers/notifications.py`
  - Nincs conflict, nem létezik main-en
  - Schemas: `NotificationOut` hozzáadása `schemas.py`-hoz

- [ ] **T1.3** — Alembic framework áthozása
  - Fájlok: `alembic.ini`, `alembic/env.py`, `alembic/versions/001_*.py`, `alembic/versions/002_*.py`
  - Nincs conflict, nem létezik main-en

- [ ] **T1.4** — Dockerfile.worker.gpu áthozása
  - Fájl: `Dockerfile.worker.gpu` (RunPod XTTS-v2 pre-baked image)
  - Nincs conflict

- [ ] **T1.5** — `.env.example` létrehozása branch alapján
  - Tartalom: összes env var dokumentálva

### Egymásra épülő feladatok (szekvenciális)

- [ ] **T1.6** — `models.py` merge (függ: T1.2, T1.3)
  - Branch modellek átvétele: `User`, `UserSettings`, `CreditBalance`, `CreditTransaction`, `Notification`, `user_id NOT NULL`
  - Main modellek megtartása: `ReadingState`, `Chapter.segments`, `Chapter.emotional_arc`, `Chapter.summary`
  - Relationship-ek egyeztetése

- [ ] **T1.7** — `config.py` merge (független)
  - Branch: `cors_origins: list[str]`, `resend_api_key`, `email_from`, `free_signup_credits`
  - Main megtartás: `ollama_url`, `ollama_model`
  - Mező eltérés: branch `ollama_base_url` → main `ollama_url` (main konvenció marad)

- [ ] **T1.8** — `auth.py` merge (függ: T1.6, T1.7)
  - Branch auth rendszer átvétele: `get_current_user_optional`, `get_current_user`, auto-user-creation
  - Main `auth_routes.py` (register/login) integrálása branch auth-tal

- [ ] **T1.9** — `routers/books.py` merge (függ: T1.6, T1.8)
  - Branch: user isolation (`_get_user_book`, `Depends(get_current_user)`)
  - Main: summary generation endpoint, segments storage, text endpoint
  - Mindkettő megtartása

- [ ] **T1.10** — `routers/voices.py` merge (függ: T1.6, T1.8)
  - Branch: user isolation (`_get_user_voice`)
  - Main: emotion bank endpointok (POST/DELETE emotion clips, GET emotion-texts)
  - Mindkettő megtartása

- [ ] **T1.11** — `routers/jobs.py` merge (függ: T1.6, T1.8)
  - Branch: user isolation, start-next, start-all, retry-failed, fair scheduling
  - Main: batch generation, voice accessibility check
  - Mindkettő megtartása

- [ ] **T1.12** — `routers/reading.py` + `routers/playback.py` user isolation (függ: T1.8)
  - `user=Depends(get_current_user)` hozzáadása mindkét routerhez
  - Query szűrés `user_id`-ra

- [ ] **T1.13** — `worker.py` merge (függ: T1.1, T1.2, T1.6, T1.8)
  - Branch: R2 storage upload, notification hívások, auto-advance (next queued job)
  - Main: emotion bank ref clip selection, LLM annotator (emotional arc + summary)
  - Ez a legkomplexebb merge — mindkét oldal logikája kell

- [ ] **T1.14** — `main.py` merge (függ: T1.1, T1.2, T1.8)
  - Branch: conditional static files mount, notifications router, storage import
  - Main: reading router, egyéb router importok
  - `schemas.py` egyeztetés (branch + main schemák)

- [ ] **T1.15** — `docker-compose.yml` merge (függ: T1.7)
  - Branch compose struktúra + Ollama env vars hozzáadása workerhez
  - `AUDIOBOOK_OLLAMA_URL=http://host.docker.internal:11434`

- [ ] **T1.16** — Frontend merge értékelés (függ: T1.9–T1.12)
  - Branch: auth context, notification bell, queue UI with fair scheduling
  - Main: reading mode, emotion bank recorder, player bar, sidebar, settings
  - Döntés: mely main komponensek kellenek, melyek nem

- [ ] **T1.17** — Alembic migration 003 (függ: T1.6)
  - Ha schema eltérés van a merge után: `003_reconcile_schema.py`
  - ReadingState + Chapter mezők (segments, emotional_arc, summary) ha hiányoznak

- [ ] **T1.18** — Integráció teszt (függ: T1.6–T1.15)
  - `docker compose up` elindul
  - Regisztráció + login működik
  - Könyvfeltöltés, voice, job, notification flow végig működik
  - Fair queue 2 userrel tesztelve

---

## FÁZIS 2: Inference client absztrakció

### Független feladatok (párhuzamosítható)

- [ ] **T2.1** — `inference_client.py` — `LocalTTSClient` implementáció
  - Fájl: `backend/app/services/inference_client.py`
  - `InferenceClient` Protocol definíció
  - `LocalTTSClient`: meglévő `TTSEngine` wrapper
  - Nem függ RunPod-tól, azonnal tesztelhető lokálisan

- [ ] **T2.2** — `config.py` bővítés inference + LLM mezőkkel
  - Új mezők: `inference_provider`, `runpod_api_key`, `runpod_tts_endpoint_id`, `runpod_timeout_s`
  - Új mezők: `llm_provider`, `llm_api_base`, `llm_api_key`, `llm_model`
  - Nem töri el a meglévő kódot (default értékek)

- [ ] **T2.3** — RunPod handler könyvtár létrehozása
  - `runpod/handler.py`: serverless handler (text → XTTS-v2 → R2 upload)
  - `runpod/Dockerfile`: branch `Dockerfile.worker.gpu` alapján, handler CMD
  - `runpod/requirements.txt`: TTS + R2 dependencies
  - Független a backend kódtól, külön deployolható

### Egymásra épülő feladatok

- [ ] **T2.4** — `RunPodTTSClient` implementáció (függ: T2.1, T2.2)
  - `inference_client.py`-ba: RunPod serverless API hívás (httpx)
  - Submit job → poll status → get result pattern
  - Timeout handling, retry logic

- [ ] **T2.5** — `llm_annotator.py` dual provider (függ: T2.2)
  - `_call_openai_compatible()` metódus hozzáadása
  - `provider` paraméter az `__init__`-ben
  - `_call_llm()` routing: ollama vs openai_compatible
  - Backward compatible: default `ollama` provider

- [ ] **T2.6** — `worker.py` átírás inference_client-re (függ: T2.1, T2.4, T2.5)
  - `startup()`: provider alapján LocalTTSClient / RunPodTTSClient
  - `startup()`: LLMAnnotator provider config
  - `generate_tts()`: `ctx["inference_client"]` használata
  - Progress callback adaptálás (RunPod polling vs local callback)

- [ ] **T2.7** — Lokál teszt: local provider (függ: T2.6)
  - `AUDIOBOOK_INFERENCE_PROVIDER=local` — minden mint eddig
  - `AUDIOBOOK_LLM_PROVIDER=ollama` — Ollama mint eddig
  - Regresszió teszt: teljes job flow

- [ ] **T2.8** — Cloud teszt: RunPod + OpenAI-compatible (függ: T2.3, T2.6)
  - RunPod handler deploy (Docker build + push + endpoint create)
  - `AUDIOBOOK_INFERENCE_PROVIDER=runpod` — TTS RunPod-on
  - `AUDIOBOOK_LLM_PROVIDER=openai_compatible` — cloud LLM
  - E2E teszt: job → RunPod → R2 → lejátszás

---

## FÁZIS 3: Production deployment

### Független feladatok (párhuzamosítható)

- [ ] **T3.1** — `.env.production.example` létrehozása
  - Összes production env var dokumentálva
  - Railway, Upstash, R2, RunPod, LLM API, Resend

- [ ] **T3.2** — `.env.local.example` létrehozása
  - Lokál dev defaults + hybrid mód commented out
  - 3 fejlesztési mód dokumentálva

- [ ] **T3.3** — Health endpointok
  - `GET /health/live` — always 200
  - `GET /health/ready` — DB + Redis connection check
  - Fájl: `backend/app/main.py`

- [ ] **T3.4** — Backend Dockerfile production mód
  - Build arg / ENVIRONMENT env var
  - `--reload` csak dev-ben, `--workers 2` production-ben
  - Multi-stage build opcionális

- [ ] **T3.5** — Frontend Dockerfile finalizálás
  - Branch Dockerfile átvétele (multi-stage, standalone output)
  - `NEXT_PUBLIC_API_URL` env var

### Egymásra épülő feladatok

- [ ] **T3.6** — RunPod serverless endpoint deploy (függ: T2.3)
  - Docker build + push GHCR-re
  - RunPod endpoint config: min_workers=0, max_workers=2, idle_timeout=300s
  - Endpoint ID dokumentálása

- [ ] **T3.7** — Railway staging deploy (függ: T3.3, T3.4, T3.5, T3.6)
  - 3 service: frontend, backend, worker
  - Railway PostgreSQL add-on
  - Upstash Redis setup
  - Cloudflare R2 bucket + API keys
  - Env vars beállítása

- [ ] **T3.8** — Staging E2E validáció (függ: T3.7)
  - Regisztráció/login
  - Könyvfeltöltés → R2
  - Job → RunPod → audio R2-ben
  - Lejátszás R2 public URL-ről
  - Notification megjelenik

---

## FÁZIS 4: Hardening

### Független feladatok (párhuzamosítható)

- [ ] **T4.1** — Rate limiting
  - `slowapi` dependency hozzáadás
  - Auth: 10 req/min/IP
  - Upload: 5 req/min/user
  - Job creation: 20 req/min/user

- [ ] **T4.2** — Production logging
  - Strukturált JSON log format (backend + worker)
  - `request_id` middleware
  - Inference hívás logolás: provider, model, latency, input/output size

- [ ] **T4.3** — JWT secret production validation
  - Startup fail ha `jwt_secret == "dev-secret-change-in-production"` és `ENVIRONMENT=production`
  - `ENVIRONMENT` env var hozzáadása config-hoz

- [ ] **T4.4** — Circuit breaker a RunPodTTSClient-ben
  - Exponential backoff: 3 retry
  - Circuit breaker: 5 consecutive failure → 60s cooldown
  - Timeout: 10 perc TTS generation-re

### Egymásra épülő feladatok

- [ ] **T4.5** — Refresh token rotáció (függ: T1.8)
  - Access token: 15 perc expiry
  - Refresh token: 7 nap, DB-ben tárolva
  - `POST /api/auth/refresh` endpoint
  - `RefreshToken` model + migration

- [ ] **T4.6** — Alembic CI/CD (függ: T1.3)
  - Railway pre-deploy command: `alembic upgrade head`
  - `ENVIRONMENT` alapján auto-migration

- [ ] **T4.7** — Hardening E2E validáció (függ: T4.1–T4.6)
  - Rate limiting blokkolja a túlzott kéréseket
  - Token refresh működik
  - JSON logok request_id-val
  - RunPod failure → retry → circuit breaker
  - Alembic migration automatikusan fut deploy-kor

---

## FÁZIS 5: Dokumentáció

### Független feladatok

- [ ] **T5.1** — Makefile bővítés
  - `make dev-cloud` target (hybrid mód)
  - `make dev-local` target (teljesen lokál)

- [ ] **T5.2** — README frissítés
  - 3 fejlesztési mód dokumentálása
  - Production deploy lépések
  - Architecture overview diagram

---

## Összefoglaló: feladat függőségi fa

```
FÁZIS 1 (merge):
  T1.1 (storage) ─────────────────────────────┐
  T1.2 (notifications) ───────────────────────┤
  T1.3 (alembic) ─────────────────────────────┤
  T1.4 (gpu dockerfile) ──────────────────────┤
  T1.5 (.env.example) ────────────────────────┤
  T1.7 (config merge) ────────────────────────┤
                                               │
  T1.6 (models merge) ← T1.2, T1.3            │
  T1.8 (auth merge) ← T1.6, T1.7              │
  T1.9 (books router) ← T1.6, T1.8            │
  T1.10 (voices router) ← T1.6, T1.8          │
  T1.11 (jobs router) ← T1.6, T1.8            │
  T1.12 (reading+playback) ← T1.8             │
  T1.13 (worker merge) ← T1.1, T1.2, T1.6    │
  T1.14 (main.py merge) ← T1.1, T1.2, T1.8   │
  T1.15 (docker-compose) ← T1.7               │
  T1.16 (frontend merge) ← T1.9–T1.12         │
  T1.17 (migration 003) ← T1.6                │
  T1.18 (integráció teszt) ← T1.6–T1.15       │

FÁZIS 2 (inference):
  T2.1 (LocalTTSClient) ──────────────────────┐
  T2.2 (config bővítés) ──────────────────────┤
  T2.3 (RunPod handler) ──────────────────────┤
                                               │
  T2.4 (RunPodTTSClient) ← T2.1, T2.2         │
  T2.5 (LLM dual provider) ← T2.2             │
  T2.6 (worker átírás) ← T2.1, T2.4, T2.5    │
  T2.7 (lokál teszt) ← T2.6                   │
  T2.8 (cloud teszt) ← T2.3, T2.6             │

FÁZIS 3 (deploy):
  T3.1 (.env.production) ─────────────────────┐
  T3.2 (.env.local) ──────────────────────────┤
  T3.3 (health endpoints) ────────────────────┤
  T3.4 (backend Dockerfile) ──────────────────┤
  T3.5 (frontend Dockerfile) ─────────────────┤
                                               │
  T3.6 (RunPod deploy) ← T2.3                 │
  T3.7 (Railway deploy) ← T3.3–T3.6           │
  T3.8 (staging E2E) ← T3.7                   │

FÁZIS 4 (hardening):
  T4.1 (rate limiting) ───────────────────────┐
  T4.2 (logging) ─────────────────────────────┤
  T4.3 (JWT validation) ──────────────────────┤
  T4.4 (circuit breaker) ─────────────────────┤
                                               │
  T4.5 (refresh token) ← T1.8                 │
  T4.6 (alembic CI/CD) ← T1.3                 │
  T4.7 (hardening E2E) ← T4.1–T4.6            │

FÁZIS 5 (docs):
  T5.1 (Makefile) ─────────────────────────────
  T5.2 (README) ───────────────────────────────
```
