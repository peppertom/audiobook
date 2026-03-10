# Publikus üzemeltetési és GPU inference szétválasztási terv

## 0) Célkép röviden

A cél egy **publikusan elérhető, skálázható SaaS architektúra** az audiobook alkalmazáshoz, ahol:

- a **frontend** külön szolgáltatásként fut (Next.js),
- a **core backend API** külön szolgáltatásként fut (FastAPI),
- az **audio generálás (TTS)** és a **summary generálás (LLM)** külön, GPU-optimalizált inference rétegbe kerül,
- a fájlok **object storage-ban** vannak (S3 kompatibilis),
- később a frontendből **PWA + részleges offline működés** is támogatott.

---

## 1) Javasolt platform-stratégia (döntési javaslat)

### 1.1 App réteg (frontend + API + worker):

**Ajánlott: Railway vagy Render indulásnak**

- gyors setup,
- menedzselt Postgres/Redis,
- egyszerű CI/CD GitHub-ról,
- költséghatékony MVP → növekedésig.

**Alternatíva haladóbb üzemhez: Fly.io vagy AWS/GCP**

- Fly.io: erős régiós futtatás, jó latency kontroll.
- AWS/GCP: nagyvállalati governance, IAM, VPC, megfigyelhetőség, compliance.

### 1.2 GPU inference réteg (TTS + summary):

**Ajánlott induló opció: RunPod Serverless/Pods**

- gyors GPU bring-up,
- jó ár/érték prototípusra,
- egyszerű konténeres inference deploy.

**Alternatívák:**

- **Replicate**: legegyszerűbb API jellegű modell-futtatás, viszont drágább lehet nagy volumennél.
- **Modal**: fejlesztőbarát, skálázás jó, Python-közeli workflow.
- **AWS SageMaker / GCP Vertex AI**: enterprise grade, de magasabb komplexitás.
- **Vast.ai**: olcsóbb lehet, de operatív overhead jellemzően nagyobb.

**Döntési javaslat:**
1. Fázis 1–2: RunPod.
2. Fázis 3-tól (stabil PMF, növekvő forgalom): összehasonlító benchmark után Modal vagy saját K8s GPU pool.

### 1.3 Fájltárolás:

**S3-kompatibilis object storage kötelező** (audio, cover, feldolgozott fejezet, cache artifact).

Ajánlott sorrend:
1. **Cloudflare R2** (jó egress költségprofil),
2. **AWS S3** (standard, enterprise),
3. **Backblaze B2** (kedvező ár, egyszerű).

---

## 2) Cél architektúra (logikai)

1. **Frontend (Next.js)**: UI + auth session kezelés + PWA shell.
2. **Core API (FastAPI)**: user, könyv, job orchestration, státusz, billing.
3. **Queue/Job orchestration (Redis + worker)**: hosszú futású feladatok kezelése.
4. **Inference Gateway service**: egységes belső API a TTS/summary szolgáltatások felé.
5. **TTS GPU service**: dedikált endpoint az audio generáláshoz.
6. **Summary GPU service**: dedikált endpoint fejezet-összefoglalóhoz.
7. **PostgreSQL**: üzleti adatok.
8. **Object storage**: tartalom és generált fájlok.
9. **Observability**: log, metric, tracing, alert.

Fontos elv: a core API **nem futtat közvetlen GPU inferenciát**, csak orchestrál.

---

## 3) Step-by-step végrehajtási terv

## Fázis A — Előkészítés (1–2 hét)

### A1. Produktum és SLA definiálás
- Válaszd ki a cél régiót (pl. EU-central), hogy latency és GDPR kezelhető legyen.
- Határozd meg az SLO-kat:
  - API availability (pl. 99.9%),
  - TTS job várakozási idő,
  - summary válaszidő.
- Definiáld a költségplafont/hó (külön CPU és GPU budget).

### A2. Környezetek és branch-stratégia
- Környezetek: `dev`, `staging`, `prod`.
- Külön adatbázis + storage bucket környezetenként.
- GitHub branch protection + kötelező CI checkek.

### A3. Secret és kulcskezelés
- Titkokat csak platform secret store-ban tárold.
- Rotációs policy: 60–90 nap.
- Service-to-service auth tokenek bevezetése (JWT/HMAC).

---

## Fázis B — Core app publikus deploy (1–2 hét)

### B1. Frontend deploy
- Next.js deploy Vercelre **vagy** ugyanarra a platformra, ahol az API fut.
- Állítsd be:
  - `NEXT_PUBLIC_API_URL`,
  - HTTPS kényszerítés,
  - biztonsági headerek (CSP minimum baseline).

### B2. Backend API deploy
- FastAPI konténer deploy (Railway/Render/Fly).
- Uvicorn/Gunicorn worker tuning.
- Health endpointek:
  - `/health/live`,
  - `/health/ready`.

### B3. Adatbázis és migrációk
- Menedzselt Postgres provisioning.
- Alembic migráció pipeline CI-ban.
- Automatikus backup + restore teszt.

### B4. Queue és worker
- Redis provisioning.
- Worker külön service-ként deploy.
- Retry policy és DLQ (dead letter queue) stratégia.

### B5. Storage bekötés
- Lokális fájlrendszer helyett object storage driver.
- Presigned URL workflow letöltéshez.
- Lifecycle policy:
  - átmeneti artifact törlés (pl. 7–30 nap),
  - végleges audio retention policy üzleti döntés alapján.

---

## Fázis C — Inference szétválasztás (2–3 hét)

### C1. Inference Gateway kialakítása
- Készíts külön `inference-gateway` service-t (FastAPI).
- Feladata:
  - auth ellenőrzés a core API felől,
  - request validáció,
  - request routing TTS vs summary felé,
  - standardizált hibakezelés.

### C2. TTS GPU service (RunPod)
- Docker image a kiválasztott TTS modellel.
- Endpoint szerződés:
  - input: normalized text + voice profile + params,
  - output: object storage URI + meta.
- Chunk alapú feldolgozás (hosszú fejezetekhez).
- GPU warm pool vagy minimum 1 hot replica csúcsidőben.

### C3. Summary GPU service (RunPod)
- Külön konténer, külön autoscaling policy.
- Endpoint szerződés:
  - input: chapter text + max token + style,
  - output: summary text + confidence/meta.
- Prompt template verziózás (A/B teszthez).

### C4. Queue integráció
- Core API jobot nyit, worker az inference gatewayt hívja.
- Job state machine:
  - `pending` → `running` → `post_processing` → `done|failed`.
- Idempotencia kulcs minden jobhoz.

### C5. Fallback és hibatűrés
- Timeout + circuit breaker inference hívásokra.
- Summary fallback: CPU-s kisebb modell vagy delayed retry.
- TTS fallback: alacsonyabb minőségű modell opcionálisan.

---

## Fázis D — Biztonság és compliance (folyamatos, de első verzió 1 hét)

### D1. Hálózati védelem
- API rate limiting (IP + user szint).
- WAF/CDN frontdoor (Cloudflare ajánlott).
- Csak HTTPS, HSTS.

### D2. Auth és jogosultság
- Rövid élettartamú access token + refresh token rotáció.
- Service account token inference gatewayhez.
- Tenant/user izoláció fájl-hozzáférésben (prefix policy).

### D3. Adatvédelem
- At-rest titkosítás storage és DB oldalon.
- PII minimalizálás logokban.
- Törlési workflow (GDPR „right to be forgotten”).

---

## Fázis E — Megfigyelhetőség és üzemeltetés (1 hét)

### E1. Logging
- Strukturált JSON log minden service-ben.
- Központi log aggregation (pl. Loki/Datadog).

### E2. Metrics
- API latency, error rate, queue depth, GPU utilization.
- Külön dashboard TTS és summary throughput-ra.

### E3. Alerting
- Kritikus riasztások:
  - 5xx spike,
  - queue elakadás,
  - GPU endpoint tartós timeout,
  - storage hibaarány emelkedés.

### E4. Költségkontroll
- GPU óradíj monitorozás.
- Automatikus scale-to-zero csak summary-ra (ha elfogadható cold start).
- Heti cost review.

---

## Fázis F — PWA readiness és offline stratégia (1–2 hét alapverzió)

### F1. PWA alapok
- Manifest (`name`, `icons`, `display`, `theme_color`).
- Service Worker regisztráció.
- HTTPS + megfelelő scope.

### F2. Cache stratégia
- App shell cache (statikus assetek).
- API cache csak olvasott, nem érzékeny adatokra.
- Audio cache:
  - limitált méretű, LRU alapú törlés,
  - user által kézzel „offline letöltés” opció.

### F3. Offline UX
- Offline állapot jelzése UI-ban.
- „Letöltve elérhető” fejezetlista.
- Sync visszaálláskor (progress, bookmark).

### F4. Háttérszinkron
- Background sync queue (ahol a böngésző támogatja).
- Konfliktuskezelés: last-write-wins + időbélyeg.

### F5. PWA korlátok kezelése
- iOS Safari storage limit dokumentálása.
- Nagy audio fájloknál partial cache + streaming fallback.

---

## 4) Javasolt konkrét technológiai stack (indulás)

- **Frontend**: Vercel (Next.js) + Cloudflare CDN.
- **Backend API + worker**: Railway/Render.
- **DB**: managed PostgreSQL.
- **Queue**: Redis.
- **Object storage**: Cloudflare R2 (S3 API).
- **GPU inference**: RunPod (TTS és summary külön service).
- **Monitoring**: Sentry + Grafana/Prometheus vagy Datadog.

---

## 5) RunPod vs alternatívák rövid döntési mátrix

- **RunPod**: gyors indulás, jó ár, közepes operatív teher.
- **Modal**: kiváló DX, jó autoscaling, általában drágább lehet hosszú futásra.
- **Replicate**: leggyorsabb integráció, de unit economics gyakran gyengébb nagy volumenben.
- **SageMaker/Vertex**: enterprise erős, de setup és költség-komplexitás magas.

**Ajánlás:** MVP/korai növekedés: RunPod. Stabil skála esetén negyedéves TCO benchmark.

---

## 6) 30-60-90 napos végrehajtási roadmap

### 0–30 nap
- Core app production hardening (API, DB, Redis, storage).
- CI/CD + migráció + backup + alap monitoring.
- Inference gateway skeleton.

### 31–60 nap
- TTS + summary kiszervezés RunPodra.
- Queue és state machine stabilizálás.
- Költség/latency baseline mérés.

### 61–90 nap
- PWA alapverzió (installable + offline app shell + letöltött fejezetek).
- Advanced observability + riasztási finomhangolás.
- Platform review (RunPod vs Modal/SageMaker) valós workload alapján.

---

## 7) Kockázatok és mitigációk

1. **GPU cold start miatti késés**
   - Mitigáció: minimum warm instance csúcsidőben, queue alapú UX.
2. **Storage költség elszaladás**
   - Mitigáció: lifecycle rule + tömörítési policy + inaktív tartalom archiválás.
3. **Vendor lock-in**
   - Mitigáció: inference gateway absztrakció + konténer standard.
4. **PWA audio offline limitációk mobilon**
   - Mitigáció: fejezetenkénti letöltés, méretkorlát, platform-specifikus UX.

---

## 8) Konkrét következő 10 teendő (prioritás szerint)

1. Döntés: app platform (Railway vs Render) + régió.
2. Döntés: object storage (R2 vs S3).
3. Külön `inference-gateway` repo/service létrehozása.
4. TTS és summary API contract véglegesítése (OpenAPI).
5. Redis queue és job state machine szabványosítás.
6. RunPod proof-of-concept TTS endpoint.
7. RunPod proof-of-concept summary endpoint.
8. Observability minimum csomag élesítése (logs + metrics + alerts).
9. PWA manifest + service worker alap bevezetése feature flag mögött.
10. Terheléses és költségteszt (100/500/1000 napi job szint).

Ez a sorrend gyorsan ad működő, publikus rendszert, miközben előkészíti a GPU inference skálázást és a későbbi PWA/offline bővítést.
