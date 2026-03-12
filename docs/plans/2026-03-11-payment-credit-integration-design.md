# Fizetési integráció + credit rendszer bevezetési design terv

## 1. Cél és scope

### Cél
- Előfizetéses és használat-alapú (credit) fizetési modell bevezetése.
- Átlátható, auditálható credit fogyasztás minden AI művelethez.
- Kiszámítható árképzés: előre jelezhető credit költség audio és summary generálásnál.

### Scope-ban
- Csomagok (Free/Pro/Business) és credit vásárlás.
- Credit ledger (főkönyv) és tranzakciós elszámolás.
- Költségmodell audio generálásra és summary generálásra.
- Backend API és worker oldali integráció.
- Frontend oldali credit egyenleg, előrejelzés, költési történet.
- Webhook alapú fizetési állapotkezelés.

### Scope-on kívül (külön projekt)
- Adózási/számlázási lokalizáció (pl. NAV közvetlen jelentés).
- Több fizetési szolgáltató párhuzamos támogatása (első körben 1 provider).
- B2B egyedi szerződéses árképzés és kézi invoicing.

---

## 2. Üzleti modell javaslat

### 2.1 Csomagok
- **Free**
  - Havi fix kredit keret (pl. 100 credit), lejár hónap végén.
  - Limitált funkciók (pl. csak standard hangok).
- **Pro**
  - Havi nagyobb kredit keret (pl. 1 500 credit).
  - Kedvezőbb credit/unit ár.
  - Extra voice opciók és prioritás queue.
- **Business**
  - Havi nagy keret (pl. 10 000+ credit), seat alapú bővítés.
  - Csapat szintű közös credit pool opció.

### 2.2 Kiegészítő top-up
- Egyszeri credit vásárlás (pl. 500 / 2 000 / 10 000 credit csomag).
- Lejárat: 6-12 hónap (jogi/üzleti döntés alapján).
- Felhasználási prioritás:
  1. Lejáró promo credit
  2. Havi előfizetés credit
  3. Top-up credit

### 2.3 Fair use és védelem
- Per-request max token/karakter limit.
- Daily soft/hard cap (abuse és költség robbanás ellen).
- Anomália detektálás (szokatlan mennyiségű rövid időn belüli generálás).

---

## 3. Credit ledger (főkönyv) architektúra

## 3.1 Miért ledger?
A sima `users.credit_balance` mező önmagában nem auditálható. Ledgerrel minden mozgás nyomon követhető és visszavezethető (payment, usage, refund, admin korrekció).

## 3.2 Adatmodell (backend)

### Táblák
1. **credit_wallets**
   - `id`
   - `user_id` (unique)
   - `balance_available`
   - `balance_reserved`
   - `updated_at`

2. **credit_ledger_entries**
   - `id`
   - `user_id`
   - `entry_type` (`grant`, `reserve`, `consume`, `release`, `refund`, `expire`, `adjustment`)
   - `amount` (pozitív/negatív konvencióval vagy külön `direction` mezővel)
   - `currency` (`CREDIT`)
   - `source_type` (`subscription`, `topup`, `job_audio`, `job_summary`, `admin`, `promo`)
   - `source_id` (pl. payment_id, job_id)
   - `idempotency_key` (egyedi)
   - `metadata_json` (modell, token, karakter, percdíj komponensek)
   - `created_at`

3. **credit_grants**
   - `id`
   - `user_id`
   - `grant_type` (`monthly`, `topup`, `promo`)
   - `total_amount`
   - `remaining_amount`
   - `expires_at`
   - `priority`

4. **billing_events**
   - `id`
   - `provider` (`stripe`)
   - `event_id` (provider event unique)
   - `event_type`
   - `payload_json`
   - `processed_at`
   - `status`

## 3.3 Foglalás + végleges elszámolás
- **1. lépés (reserve):** job indításakor becsült credit foglalás.
- **2. lépés (consume/release):** job végén tényleges költség szerint elszámolás.
  - Ha tényleges < foglalt → különbözet felszabadítás.
  - Ha tényleges > foglalt → pótlólagos terhelés (ha van fedezet), különben job policy.

## 3.4 Idempotencia és konzisztencia
- Minden credit művelet idempotency key alapú.
- Webhook feldolgozás event_id alapú deduplikálással.
- DB tranzakció + `SELECT ... FOR UPDATE` a wallet soron.

---

## 4. Credit költségszámítási modell

A cél: egyszerre legyen
- felhasználónak érthető,
- backendben determinisztikus,
- provider költséggel arányos.

## 4.1 Alapelv
**1 credit = 1 belső elszámolási egység**, ami periodikusan igazítható a valós infrastruktúra költségekhez.

Ajánlott képlet:

`credit_cost = ceil(base_cost + input_component + output_component + voice_component + premium_component)`

ahol a komponensek feature-től függnek.

## 4.2 Audio generálás credit képlet

### Mértékek
- `chars_in`: feldolgozott karakterek száma (tisztított text).
- `audio_seconds`: generált audio hossza másodpercben (vagy becsült érték előre).
- `voice_tier`: `standard` / `premium` / `studio`.
- `pipeline_flags`: pl. emotion, enhancement, denoise.

### Javasolt költségfüggvény

`audio_credit = ceil(
  A_base
  + A_char * (chars_in / 1000)
  + A_sec * (audio_seconds / 60)
  + A_voice_multiplier[voice_tier]
  + A_flags
)`

Példa paraméterezés (induló):
- `A_base = 1`
- `A_char = 2`
- `A_sec = 3`
- `A_voice_multiplier`:
  - standard: 0
  - premium: +3
  - studio: +8
- `A_flags`:
  - emotion: +2
  - enhancement: +1

#### Előzetes becslés (job indításkor)
- `estimated_audio_seconds = chars_in / avg_chars_per_second`
- `avg_chars_per_second` induló érték: 14-18 nyelvfüggően.
- Reserve ezen becslés alapján + 10-20% buffer.

#### Végleges elszámolás (job végén)
- Tényleges `audio_seconds` alapján `consume`.

## 4.3 Summary generálás credit képlet

### Mértékek
- `input_tokens`
- `output_tokens`
- `model_tier` (`base`, `quality`, `premium`)
- `summary_length_mode` (`short`, `medium`, `long`)

### Javasolt költségfüggvény

`summary_credit = ceil(
  S_base
  + S_in * (input_tokens / 1000)
  + S_out * (output_tokens / 1000)
  + S_model_multiplier[model_tier]
  + S_length_multiplier[summary_length_mode]
)`

Példa induló paraméterek:
- `S_base = 1`
- `S_in = 1.2`
- `S_out = 2.5`
- `S_model_multiplier`:
  - base: 0
  - quality: +2
  - premium: +5
- `S_length_multiplier`:
  - short: 0
  - medium: +1
  - long: +2

#### Előzetes becslés
- input token becslés karakterből (`chars / 4` tipikus közelítés nyugati nyelveknél).
- output token becslés summary mode alapján fix célértékkel.

#### Végleges elszámolás
- Provider visszajelzett token usage alapján.

## 4.4 Minimum és maximum guardrail
- Minden kérés minimum 1 credit.
- Maximum költség cap requestenként (pl. 300 credit), e felett explicit user confirm.
- Ha becslés > egyenleg, ne induljon job (vagy ajánljon top-upot).

---

## 5. Fizetési provider integráció (Stripe-first javaslat)

## 5.1 Fő folyamatok
1. **Checkout Session** létrehozása (subscription vagy top-up).
2. Sikeres fizetés után webhook:
   - `checkout.session.completed`
   - `invoice.paid`
   - `customer.subscription.updated`
3. Webhook feldolgozó létrehozza a megfelelő `credit_grant` rekordot.
4. Ledger bejegyzés: `grant`.

## 5.2 Refund / chargeback
- Refund eseménynél:
  - ha kredit még nem elhasznált: visszavonás (`adjustment` vagy `expire`).
  - ha már elhasznált: negatív egyenleg policy vagy manuális review.

## 5.3 Biztonság
- Webhook aláírás ellenőrzés.
- Provider event idempotens tárolás.
- Rate limit a payment endpointokon.

---

## 6. Backend változtatások (javasolt a jelenlegi struktúrához)

## 6.1 Új modulok
- `backend/app/services/billing.py`
  - checkout létrehozás
  - webhook esemény mapping
- `backend/app/services/credit_ledger.py`
  - reserve/consume/release/grant/refund API
- `backend/app/routers/billing.py`
  - `/billing/checkout`
  - `/billing/portal`
  - `/billing/webhook`
  - `/billing/wallet`

## 6.2 Meglévő kredit logika refaktor
- A jelenlegi `services/credits.py` bővítése vagy kiváltása ledger-központú implementációra.
- Job indító endpointok (`jobs`, `books`, `reading` érintettséggel) reserve hívása.
- Worker job completion ponton final consume/release.

## 6.3 API contract példák
- `GET /billing/wallet`
  - `available`, `reserved`, `next_expiration`, `recent_entries`
- `POST /jobs/{id}/estimate-cost`
  - visszaadja `estimated_credit` és komponens bontást.

---

## 7. Frontend UX terv

## 7.1 Fő UI elemek
- Profilban/wallet oldalon:
  - aktuális egyenleg,
  - havi felhasználás,
  - lejáró credit figyelmeztetés,
  - tranzakció történet.
- Generálás előtt cost preview:
  - „Ez a művelet várhatóan X creditbe kerül”.
- Insufficient credit modal:
  - top-up CTA vagy csomag upgrade.

## 7.2 UX részletek
- Becsült és végleges költség külön jelölve.
- Hover segítség: „miért ennyi” (token/karakter/audio idő bontás).
- Soft warning 80% havi limitnél.

---

## 8. Monitoring, riporting, pénzügyi kontroll

### KPI-k
- ARPU, MRR, conversion rate Free→Pro.
- Credit burn/user/day.
- Audio vs summary költés arány.
- Payment success rate, webhook failure rate.

### Operatív dashboard
- Napi grant vs consume egyensúly.
- Top 10 költséges user/workload.
- Negatív margin anomáliák (provider költség > credit revenue).

---

## 9. Rollout terv

## Fázis 1 – Alap ledger + manual top-up (1-2 hét)
- Ledger tábla + wallet API.
- Admin jóváírás, manuális terhelés.
- Audio/summary becslő endpoint.

## Fázis 2 – Stripe checkout + webhook (1 hét)
- Top-up automatizálás.
- Idempotens webhook processzor.

## Fázis 3 – Subscription + havi grant (1 hét)
- Csomagkezelés, recurring grant.
- Frontend wallet és billing page.

## Fázis 4 – Optimalizáció (folyamatos)
- Paraméterhangolás valós usage alapján.
- A/B teszt pricing és credit képleteken.

---

## 10. Döntési checklist (vezetői/termék)

A bevezetés előtt rögzítendő:
1. Credit egység „forint ekvivalens” belső referencia.
2. Csomagok havi credit kerete és árpontjai.
3. Top-up lejárati szabály.
4. Refund policy és negatív egyenleg szabály.
5. Premium voice és hosszú summary felár mértéke.
6. Kommunikációs szöveg (fair use, becsült költség, végleges elszámolás).

---

## 11. Rövid, implementálható számítási példa

### Audio példa
- Input: 12 000 karakter, premium voice, emotion on.
- Becsült audio hossz: `12000 / 15 = 800 sec` (~13.3 perc).
- Képlet:
  - base: 1
  - char komponens: `2 * 12 = 24`
  - sec komponens: `3 * 13.3 = 39.9`
  - premium voice: +3
  - emotion: +2
  - összesen: 69.9 → **70 credit**

### Summary példa
- Input: 8 000 token, output: 900 token, quality model, medium.
- Képlet:
  - base: 1
  - input: `1.2 * 8 = 9.6`
  - output: `2.5 * 0.9 = 2.25`
  - quality: +2
  - medium: +1
  - összesen: 15.85 → **16 credit**

Ez az induló modell egyszerű, transzparens és jól kalibrálható később a valós provider költségekhez.
