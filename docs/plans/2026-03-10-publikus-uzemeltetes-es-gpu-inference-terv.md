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

## 8) Döntés rögzítése (induló production célállapot)

Az alábbi döntésekkel számol a végrehajtási terv:

1. **App platform**: Railway (EU régió).
2. **Object storage**: Cloudflare R2.
3. **Inference**: RunPod (TTS és summary külön endpoint).
4. **Frontend**: Vercel (publikus web), backend Railway-n.
5. **Auth policy**: regisztráció engedett, de **admin jóváhagyás szükséges** a belépéshez (zárt béta mód).

> Megjegyzés: ha a régió vagy vendor változik, a checklist lépései nagyrészt megtarthatók, csak a provider-specifikus részeket kell cserélni.

---

## 9) Részletes, manuális lépéseket is tartalmazó step-by-step task lista

Az alábbi lista végén a rendszer egy publikus URL-en elérhető és használható, admin approval workflow-val.

### 9.1 Fiókok, szervezetek, hozzáférések (manuális)

1. **Railway account + project létrehozása**
   - Menj: https://railway.app
   - Regisztrálj / lépj be.
   - Hozz létre új projektet: `audiobook-prod`.
2. **Cloudflare account + R2 bekapcsolása**
   - Menj: https://dash.cloudflare.com
   - Regisztrálj / lépj be.
   - R2 szolgáltatás aktiválása.
3. **RunPod account**
   - Menj: https://runpod.io
   - Regisztrálj / lépj be.
   - API key generálása.
4. **Vercel account**
   - Menj: https://vercel.com
   - Regisztrálj / lépj be.
   - Csatlakoztasd a GitHub repositoryt.
5. **Sentry (opcionális, de ajánlott)**
   - Menj: https://sentry.io
   - Frontend + backend project létrehozása.

### 9.2 Domain és DNS (manuális)

1. Vásárolj / használd meglévő domaint (pl. `audiobookapp.hu`).
2. Állíts be subdomain-eket:
   - `app.<domain>` → frontend (Vercel),
   - `api.<domain>` → backend (Railway),
   - `admin.<domain>` opcionális admin felülethez.
3. DNS rekordok beállítása Cloudflare-ben a provider instrukciói alapján.

### 9.3 Repository és környezetek előkészítése

1. Branch-ek és környezetek:
   - `main` → production,
   - `develop` → staging.
2. GitHub branch protection:
   - kötelező PR review,
   - kötelező CI check.
3. Hozz létre env fájl sablont (`.env.example`) minden szükséges változóval.

### 9.4 Railway production stack létrehozása

1. Railway projektben hozd létre service-ket:
   - `backend-api`,
   - `worker`,
   - `postgres` (managed),
   - `redis` (managed).
2. Region beállítás EU-ra (pl. eu-west).
3. Állítsd be a backend környezeti változókat:
   - DB URL, Redis URL,
   - JWT secret,
   - CORS origin,
   - R2 endpoint + bucket + access key + secret key,
   - RunPod API endpoint + token.
4. Állítsd be a worker környezeti változókat ugyanígy.
5. Healthcheck endpoint ellenőrzése (`/health/live`, `/health/ready`).

### 9.5 Cloudflare R2 bekötés

1. Hozz létre bucketeket:
   - `audiobook-prod-books`,
   - `audiobook-prod-audio`,
   - `audiobook-prod-voices`.
2. Hozz létre API tokent minimális jogosultsággal (bucket szint).
3. Lifecycle szabályok:
   - ideiglenes artifact törlés (7–30 nap),
   - végleges audio retention üzleti szabály alapján.
4. CORS szabályok bucket szinten (frontend domainre korlátozva).
5. Tesztelj egy upload + presigned URL letöltést.

### 9.6 Inference gateway + OpenAPI contract

1. Hozz létre külön service/repo-t: `inference-gateway`.
2. Definiáld az OpenAPI contractot:
   - `/tts/generate`,
   - `/summary/generate`,
   - standard error schema,
   - request id és idempotencia kulcs.
3. Auth:
   - core API → inference gateway service token.
4. Observability:
   - request latency,
   - provider hibaarány,
   - timeout metric.

### 9.7 RunPod TTS és summary endpointok

1. Buildeld és pushold a TTS inference image-et.
2. RunPodon hozz létre TTS endpointot:
   - input schema: text + voice + params,
   - output: R2 object URI + meta.
3. Buildeld és pushold a summary inference image-et.
4. RunPodon hozz létre summary endpointot.
5. Állíts be timeout/circuit breaker policy-t a gatewayben.
6. Végezz smoke tesztet mindkét endpointon.

### 9.8 Queue + state machine standardizálás

1. Definiáld a job státuszokat: `pending` → `running` → `post_processing` → `done|failed`.
2. Retry policy + max retry + DLQ stratégia.
3. Idempotencia kulcs minden jobhoz.
4. Audit mezők: started_at, completed_at, error_code.

### 9.9 Admin approval workflow (új kötelező funkció)

1. **Adatmodell módosítás**
   - `users` táblába mezők:
     - `is_admin` (bool, default false),
     - `is_approved` (bool, default false),
     - `approved_at` (datetime, nullable),
     - `approved_by_user_id` (nullable FK users).
2. **Regisztrációs flow**
   - új user létrejön `is_approved=false` állapotban.
   - login endpoint adjon egyértelmű hibát: "jóváhagyásra vár".
3. **Admin API endpointok**
   - `GET /api/admin/pending-users`
   - `POST /api/admin/users/{id}/approve`
   - `POST /api/admin/users/{id}/reject`
4. **Seed admin user (manuális lépés)**
   - production DB-ben hozz létre első admin fiókot scriptből.
   - script futtatása csak egyszer, auditáltan.
5. **Admin UI (minimális)**
   - pending userek listája,
   - approve/reject gomb.
6. **Értesítés (opcionális v1.1)**
   - email adminnak új regisztrációnál,
   - email usernek jóváhagyáskor.

### 9.10 Frontend publikus deploy (Vercel)

1. Importáld a repót Vercelbe.
2. Production env vars:
   - `NEXT_PUBLIC_API_URL=https://api.<domain>`.
3. Build command és output ellenőrzése.
4. Domain hozzárendelés: `app.<domain>`.
5. End-to-end smoke teszt:
   - oldal betölt,
   - login működik jóváhagyott userrel,
   - jóváhagyatlan user belépése blokkolva.

### 9.11 Observability minimum csomag

1. Backend és worker strukturált JSON log.
2. Alap metrikák:
   - API p95 latency,
   - 5xx rate,
   - queue depth,
   - job success ratio,
   - GPU timeout arány.
3. Riasztások:
   - tartós 5xx spike,
   - queue torlódás,
   - RunPod endpoint timeout spike.

### 9.12 PWA alapok (feature flag mögött)

1. PWA manifest bevezetése.
2. Service worker app shell cache-hez.
3. Offline jelzés UI-ban.
4. Audio letöltés csak explicit user akcióval.

### 9.13 Terhelés- és költségteszt

1. Szcenáriók: 100 / 500 / 1000 napi job.
2. Mérendő:
   - átlag és p95 végrehajtási idő,
   - sikerráta,
   - GPU költség/job,
   - storage növekedési ráta.
3. Döntési küszöbök rögzítése:
   - mikor kell több worker,
   - mikor kell inference provider váltás vagy multi-provider routing.

---

## 10) Production Go-Live checklist (publikus URL + jóváhagyásos hozzáférés)

Go-live előtt minden pont legyen kipipálva:

1. `https://app.<domain>` publikus interneten betölt.
2. `https://api.<domain>/health/live` és `/health/ready` zöld.
3. Új user regisztrálható, de login blokkolt jóváhagyásig.
4. Admin user be tud lépni és jóvá tud hagyni pending usert.
5. Jóváhagyás után user login sikeres.
6. Könyvfeltöltés → feldolgozás → audio lejátszás működik R2 tárolással.
7. Alap riasztások élnek és tesztelve vannak.
8. Backup/restore próba legalább egyszer lefutott.
9. Incident runbook és on-call kontakt dokumentálva.
10. Költség dashboard elérhető (heti review ritual rögzítve).

Ez a checklist olyan minimális production szintet céloz, ahol a rendszer publikus URL-en működik, de kontrollált (admin approval alapú) hozzáféréssel.
