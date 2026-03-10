# Inference platform research – legmagasabb minőségű TTS + fejezet summary pipeline

## Cél

A cél az, hogy a jelenlegi MacBook Pro M1 helyi kapacitáskorlátai **ne befolyásolják** sem a hangoskönyv minőségét, sem a fejezet-összefoglalások minőségét.

Az inference platformot úgy kell előkészíteni, hogy:

1. a **hangoskönyv generálás (TTS)**,
2. a **fejezet summary generálás (LLM)**

is ugyanazon platformon menjen, de **külön modellekkel** és külön worker profillal.

---

## Kiindulási helyzet (jelenlegi stack)

A repository alapján:

- külön backend és külön worker szolgáltatás fut,
- Redis queue és Postgres állapotkezelés van,
- a worker függőségekben TTS + ML stack szerepel (`torch`, `torchaudio`, `transformers`, `coqui-tts`, `ffmpeg-normalize`),
- a local fejlesztési flow is külön worker futtatásra van optimalizálva.

Ez ideális alap arra, hogy a worker inference réteget GPU platformra költöztessük.

---

## Célarchitektúra (production-grade, multi-model)

### 1) Rétegzett felépítés

1. **API/Orchestrator** – maradhat a jelenlegi backend.
2. **Queue + state** – Redis + Postgres marad.
3. **Inference workers a platformon**:
   - **TTS worker pool** (audio generation),
   - **Summary worker pool** (chapter summarization).

### 2) Egységes inference routing

Bevezetendő egy közös `inference_router` koncepció backend oldalon:

- `task_type = tts` → TTS worker endpoint,
- `task_type = chapter_summary` → LLM worker endpoint,
- modellenként külön timeout / retry / concurrency policy.

### 3) Minőség fókuszú pipeline

#### TTS pipeline
- mondathatár-alapú chunking,
- chunkonként TTS generálás,
- stitching (crossfade, természetes szünetek),
- loudness normalizálás (audiobook target),
- egységes voice/prosody paraméterek fejezetenként.

#### Summary pipeline
- fejezetek token-budget alapú szeletelése,
- hierarchikus összefoglalás (chunk summary → chapter summary),
- fix stílusú magyar prompt template,
- strukturált output (pl. JSON: `title`, `key_points`, `characters`, `spoiler_level`).

### 4) Operációs robusztusság

- idempotens job feldolgozás,
- retry + backoff,
- timeout policy modellenként,
- részleges újraindítás (chapter resume),
- részletes observability (latency, hibaráták, cost/óra).

---

## Magyar modellekre vonatkozó ajánlás (API-alapú inference platform szemlélet)

> Itt kifejezetten nem egy fix TTS SaaS (pl. ElevenLabs) a cél, hanem olyan inference platform, ahol mi mondjuk meg a modellt.

## A) Hangoskönyv generálás (TTS) – HU minőség prioritás

### Elsődleges jelöltek benchmarkra

1. **Coqui XTTS v2**
   - többnyelvű, magyar szövegre is jól használható,
   - voice cloning és konzisztens narráció támogatott,
   - jó minőség / elérhetőség kompromisszum inference platformokon.

2. **MeloTTS (multilingual) – ha elérhető a választott platformon**
   - gyorsabb inference és jó többnyelvű minőség,
   - gyakran egyszerűbb üzemeltetési footprint.

3. **StyleTTS2-alapú deploymentek (ha rendelkezésre áll platformon)**
   - kiváló természetesség potenciál,
   - több finomhangolást igényelhet production stabilitáshoz.

### Ajánlott döntés

- **Quality-first baseline**: XTTS v2 + 1 alternatív open deployment A/B teszt.
- A győztes modell legyen rögzítve `best_quality_tts` profilként.

## B) Fejezet összefoglalás (LLM) – magyar fókusz

### Elsődleges jelöltek benchmarkra

1. **Llama 3.1 70B Instruct (self-hosted inference)**
   - erős open-source opció,
   - jó kompromisszum költség és minőség között,
   - magyar teljesítmény promptolással sokat javítható.

2. **Qwen2.5 72B Instruct (self-hosted inference)**
   - nagyon jó többnyelvű értés/összegzés,
   - magyar tartalmaknál erős strukturált output potenciál.

3. **Mixtral 8x22B Instruct (self-hosted opció)**
   - erős többnyelvű összegzés,
   - költséghatékonyabb lehet bizonyos platformokon.

4. **Mistral Large (API endpoint, ha a platformon elérhető)**
   - erős összefoglalás minőség,
   - jól kezelhető structured-output use case.

### Ajánlott döntés

- **Quality-first baseline**: 1 nagy open model (70B+) + 1 alternatív endpoint modell összehasonlítása.
- A győztes modell legyen rögzítve `best_quality_summary_hu` profilként.

---

## Konkrét bekötési terv a jelenlegi kódbázisba (API inference provider)

Ez a rész konkrétan azt írja le, mit kell módosítani, hogy a jelenlegi backend/worker kódbázisból API-alapú inference platformra menjen a TTS és a summary.

### 1) Konfigurációs réteg bővítése (`backend/app/config.py`)

Új environment változók:

- `AUDIOBOOK_INFERENCE_PROVIDER` (pl. `modal`, `runpod`, `replicate`, `custom_http`)
- `AUDIOBOOK_INFERENCE_API_BASE`
- `AUDIOBOOK_INFERENCE_API_KEY`
- `AUDIOBOOK_TTS_MODEL`
- `AUDIOBOOK_SUMMARY_MODEL`
- `AUDIOBOOK_TTS_TIMEOUT_S`
- `AUDIOBOOK_SUMMARY_TIMEOUT_S`
- `AUDIOBOOK_INFERENCE_MAX_RETRIES`

Cél: a modell- és endpoint-választás konfigurációból menjen, ne hardcode-ból.

### 2) Provider kliens bevezetése (`backend/app/services/`)

Adj hozzá új service modult, pl. `inference_client.py`, két fő metódussal:

- `generate_tts(...)`
- `generate_summary(...)`

A kliens felelőssége:

- auth header kezelés,
- provider-specifikus payload mapping,
- timeout/retry/backoff,
- egységes hibaformátum visszaadása a worker felé.

### 3) TTS engine átállítása provider-kliensre (`backend/app/services/tts_engine.py`)

- A lokális modellhívás helyett először provider kliens hívás.
- Fallback policy:
  - elsődleges: inference platform API,
  - másodlagos (opcionális): lokális worker mód dev célra.
- A válaszból audio artifact mentés maradjon kompatibilis a jelenlegi storage flow-val.

### 4) Summary pipeline átállítása provider-kliensre (`backend/app/services/llm_annotator.py`)

- Fejezet-summary hívásokat a `generate_summary(...)` endpointon keresztül intézd.
- Prompt template és structured output validáció maradjon backend oldalon.
- Modellnév a `AUDIOBOOK_SUMMARY_MODEL` env-ből jöjjön.

### 5) Worker routing frissítése (`backend/app/worker.py`)

- Külön task metadata mező: `task_type` (`tts` / `chapter_summary`).
- Worker a task típus alapján a megfelelő inference kliens metódust hívja.
- Taskonként külön timeout/retry policy alkalmazása.

### 6) Jobs API szerződés pontosítása (`backend/app/routers/jobs.py` + `backend/app/schemas.py`)

A job payloadban legyen explicit:

- `task_type`
- `model` (opcionális override; default env-ből)
- `quality_profile` (pl. `best_quality`, `balanced`)

Így a frontend/admin oldalon explicit választható lesz, melyik modellel fusson a feladat.

### 7) Egységes modell-regiszter (`backend/app/services/`)

Vezess be egy egyszerű `model_registry.py` fájlt, ami tartalmazza:

- támogatott modellek listáját,
- task/model kompatibilitást,
- default modellt taskonként.

Példa:
- `tts`: `xtts_v2`, `styletts2_hu`
- `chapter_summary`: `llama3_1_70b`, `qwen2_5_72b`

### 8) Observability és költségmérés

Minden inference hívásnál logold:

- provider,
- model,
- latency,
- input size (karakter/token),
- output size,
- request id / trace id,
- estimated cost.

Minimum helye: worker log + job metadata tábla.

### 9) Tesztelési lépések (bekötés validálása)

- Unit: provider payload mapping és retry logika.
- Integration: mock inference endpointtal TTS és summary happy path + timeout path.
- E2E: egy könyv fejezet futtatás `best_quality` profillal.

### 10) Bevezetési stratégia

1. `chapter_summary` menjen először API inference platformra (kisebb kockázat).
2. Utána TTS kis forgalmi szelettel (`canary`).
3. Végül teljes átváltás, lokális inference csak dev fallback.

---

## Platform opciók (TTS + summary közös inference szemlélet)

### A) Replicate

**Előny:** nagyon gyors PoC és modell-összehasonlítás mind TTS, mind LLM feladatra.  
**Hátrány:** hosszabb távon drágább lehet, kisebb infra-kontroll.

### B) Modal

**Előny:** Python-native workflow, jó autoscaling, kényelmes külön worker pool kialakítás TTS + summary feladatra.  
**Hátrány:** költség és platform lock-in mérlegelendő.

### C) RunPod

**Előny:** gyakran kedvezőbb GPU ár, dedikált workerre jó (TTS és LLM külön pod).  
**Hátrány:** több DevOps és üzemeltetési munka.

### D) HF Inference Endpoints

**Előny:** stabil managed endpoint élmény.  
**Hátrány:** minőség/költség arány és skálázás üzleti oldalon mérendő.

### E) Saját GPU VM (AWS/GCP/Azure)

**Előny:** maximális kontroll és testreszabhatóság.  
**Hátrány:** legnagyobb üzemeltetési teher.

---

## Free tier realitás

- TTS long-form + magas minőség + gyors válaszidő esetén a tartós free tier ritka.
- Summary LLM feladatra is általában gyorsan kinőhető a free usage.

Reálisan:

- **Trial/credit alapú indulás**: jó benchmarkra és PoC-ra,
- **production minőség + stabilitás**: jellemzően fizetős GPU/API szükséges,
- **free opciók**: inkább rövid demo és kísérleti terhelésre alkalmasak.

Következtetés: free tierrel lehet validálni, de üzemszerű magas minőséghez fizetős inference kapacitás kell.

---

## Javasolt végrehajtási terv (10 lépés)

1. **Quality baseline dataset**: 20 referencia fejezet + elvárt summary minták.  
2. **TTS benchmark mátrix**: 3–4 modell × 2 voice preset.  
3. **Summary benchmark mátrix**: 3–4 LLM × 2 prompt template.  
4. **Objektív scorecard**:
   - TTS: naturalness, artifact, prosody consistency, HU kiejtés,
   - Summary: factuality, tömörség, szerkezet, magyar nyelvhelyesség.
5. **Inference router bevezetése**: task-alapú modell routing (`tts`, `chapter_summary`).  
6. **Worker hardening**: preload, cache, timeout/retry policy model-specifikusan.  
7. **Post-process szabványosítás**: loudness target, silence policy, stitching szabályok.  
8. **Observability**: job trace, chunk trace, cost metrikák mindkét task típusra.  
9. **Fallback stratégia**: primary timeout/hibánál secondary model.  
10. **Canary rollout**: 5% → 25% → 100%, folyamatos QA-val.

---

## Kéthetes végrehajtási ütemterv

### 1. hét

- benchmark harness TTS + summary feladatra,
- 20 fejezetes tesztkészlet,
- 2 platform + több modell A/B teszt,
- elsődleges minőségi győztes modellek kiválasztása.

### 2. hét

- dedikált GPU worker deployment (külön TTS és summary worker),
- retry/idempotency/observability hardening,
- canary rollout,
- költség/minőség végső döntés.

---

## Rövid executive ajánlás

Ha az elsődleges cél a **jelenleg elérhető legjobb minőség**, akkor:

- a meglévő backend + queue maradjon,
- az inference platformon **két külön worker profilt** futtass:
  - TTS worker (hangoskönyv),
  - Summary worker (fejezet összefoglalás),
- mindkettőre külön “best quality” modellpreset legyen,
- a modelleket configból válasszátok (`AUDIOBOOK_TTS_MODEL`, `AUDIOBOOK_SUMMARY_MODEL`),
- free tier csak benchmarkra, productionre fizetős kapacitás.

Ez adja a legkisebb migrációs kockázat mellett a legnagyobb minőségi nyereséget.
