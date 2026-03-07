# Terv: szinkronszínészhez közeli minőségű hangoskönyv digitális könyvből

## 1. Célállapot (mit jelent a „színész-szint”)

A jelenlegi, „fapados” TTS-ről akkor beszélhetünk minőségi ugrásként, ha az új rendszer:

1. **Érthető és természetes**: stabil artikuláció, helyes hangsúly, természetes tempó.
2. **Érzelmileg konzisztens**: jelenetenként és karakterenként változó, de tudatos előadás.
3. **Karakter-alapú**: a narrátor és a szereplők elkülönülnek hangszínben, stílusban.
4. **Hosszú formátumban is stabil**: 8–20+ órás könyvnél sem „esik szét” a hang.
5. **Audio mastering szintű kimenet**: hangerő, dinamika, zajszint, légzéspontok, pauzák professzionálisak.

---

## 2. Stratégiai alapelv

Ne egyetlen „jobb TTS modellre” építs, hanem egy **rendezett produkciós pipeline-ra**, ahol a TTS csak egy komponens.

**Fő gondolat**:
- A színészminőség nem csak a hangmodellen múlik, hanem a bemeneten (szöveg-előkészítés), a rendezésen (prosody/érzelmi utasítások), és az utómunkán (audio mastering).

---

## 3. Végponttól végpontig architektúra

## 3.1. Ingestion és normalizálás

**Inputok**: EPUB/PDF/DOCX/tiszta TXT.

Lépések:
1. Strukturált parse (fejezet, alcím, bekezdés, dialógus, idézet).
2. Tipográfiai zajok kiszűrése (lábléc, oldalszám, tördelési hibák).
3. Nyelvi normalizáció:
   - számok, dátumok, rövidítések kiolvasása,
   - idegen szavak kezelése,
   - kiejtési szótárhoz előkészítés.

**Kimenet**: tiszta, strukturált JSON/JSONL (fejezetekre és jelenetekre bontva).

## 3.2. Narratív elemzés (NLP + LLM)

Minden szövegegységhez automatikusan állíts elő metaadatokat:

- **Beszélő azonosítás**: narrátor vs. karakter.
- **Jelenet-hangulat**: nyugodt, feszült, drámai, humoros, melankolikus stb.
- **Intenzitás**: 1–5 skálán.
- **Beszédtempó cél**: lassú / normál / gyors.
- **Hangsúlypontok**: kulcsszavak, érzelmi csúcspontok.
- **Szünetpontok**: rövid, közepes, hosszú pauza.

Ez egy „rendezői réteg”, ami TTS-vezérlő paraméterekké alakítja a nyers szöveget.

## 3.3. Karakter- és előadásprofilok

Definiálj egy **Voice Bible**-t:

- Narrátor profil: stabil, semleges/irodalmi stílus.
- Karakterprofilok:
  - hangmagasság tartomány,
  - beszédtempó,
  - artikulációs erő,
  - érzelmi amplitúdó,
  - opcionális akcentus/karakterjegy.

Minden karakterhez legyen:
- `speaker_id`
- `voice_id`
- `style_preset`
- `emotion_limits`
- `forbidden_patterns` (pl. ne legyen túl karikatúra-szerű)

## 3.4. TTS generálás kétfázisú minőségbiztosítással

### Fázis A – gyors render (preview)
- Alacsonyabb compute költséggel elkészül az első verzió.
- Automatikus QA ellenőrzés:
  - rossz kiejtés,
  - túl gyors/lassú tempó,
  - hibás hangsúly,
  - volumen-inkonzisztencia.

### Fázis B – final render
- Csak a jóváhagyott és/vagy javított szegmensek mennek high-quality renderbe.
- Egyes kritikus jelenetekhez (érzelmi csúcspont) külön „director pass” paraméterezés.

## 3.5. Post-production (audio mastering)

Minden végső hangfájlon legyen:

- Loudness normalizálás (pl. podcast/audiobook target LUFS).
- Dinamika kontroll (enyhe kompresszió, nem túlzottan).
- De-essing/eq finomhangolás (ha szükséges).
- Szünetek finom retusálása jelenetváltásnál.
- Egységes fade in/out és fejezet-átvezetések.

---

## 4. Adatmodell-javaslat (metaadatok)

Egy szegmens minimális reprezentációja:

```json
{
  "book_id": "book_123",
  "chapter": 7,
  "scene": "7_3",
  "segment_id": "7_3_014",
  "speaker_id": "character_anna",
  "text": "Nem hiszem el... tényleg megtetted?",
  "mood": "shocked",
  "intensity": 4,
  "pace": "slow",
  "pause_map": ["after_word_2:300ms", "end:700ms"],
  "emphasis_words": ["tényleg"],
  "pronunciation_overrides": ["..."],
  "tts_profile": "anna_drama_v2"
}
```

A kulcs: a TTS-nek ne csak szöveget adj, hanem **előadási utasítást** is.

---

## 5. Minőségmérés (hogyan döntöd el, hogy tényleg jobb lett)

## 5.1. Objektív metrikák

- Kiejtési hibaarány (manuális mintavételes annotációval).
- Tempó-variancia (szó/perc jelenetenként).
- Hangerő-konformitás (LUFS, peak).
- Újragenerálási arány (hány szegmenst kellett újra renderelni).

## 5.2. Szubjektív metrikák

Hallgatói panel (5–10 fő, vakteszt):
- természetesség (1–10),
- érzelmi hitelesség (1–10),
- karaktermegkülönböztetés (1–10),
- „hallgatnám 2+ órán át” valószínűség.

Cél: legalább **30–40% javulás** a jelenlegi baseline-hoz képest.

---

## 6. Fejlesztési roadmap (12 hét)

## Fázis 0 (1. hét): baseline audit
- Jelenlegi TTS pipeline feltérképezése.
- 3 reprezentatív fejezeten benchmark.
- Hibalista és prioritás.

## Fázis 1 (2–4. hét): szöveg-előkészítés + metaadat
- Strukturált parser és normalizáció.
- Dialógus-felismerés, speaker tagging.
- Alap érzelem- és tempó-osztályozó.

## Fázis 2 (5–7. hét): rendezői vezérlés
- Voice Bible bevezetése.
- Karakterprofil-rendszer.
- TTS paraméter-mapping (mood/intensity -> prosody).

## Fázis 3 (8–10. hét): QA + post-production
- Automatikus minőség-ellenőrzések.
- Hibás szegmensek célzott újrarenderelése.
- Mastering pipeline integráció.

## Fázis 4 (11–12. hét): pilot és finomhangolás
- 1 teljes könyv pilot.
- Hallgatói tesztkör.
- Végső tuning és release checklist.

---

## 7. Működési modell (human-in-the-loop)

Teljesen automata módban ritka a „színész-szint”. Praktikusabb:

1. **Auto pass**: gépi metaadat + első render.
2. **Editor pass**: csak problémás szegmensek felülvizsgálata.
3. **Director pass**: kulcsjelenetek kézi stílusbeállítása.
4. **Final master pass**: fejezetenként végső ellenőrzés.

Így skálázható marad a rendszer, de a minőség drámaian javul.

---

## 8. Technikai ötletek a „gépies” hang ellen

- **Variációs szabályok**: ne legyen minden mondat azonos dallamívű.
- **Kontextusablak növelése**: 1–2 mondat helyett teljes bekezdés kontextus a TTS-nek.
- **Érzelmi átmenetek**: ne ugrásszerűen váltson a stílus, hanem fokozatosan.
- **Mikroszünetek és légzés-szimuláció**: finom, ritka, természetes helyeken.
- **Karakter-konzisztencia guardrail**: ugyanaz a szereplő mindig ugyanabban a stílus-térben maradjon.

---

## 9. Kockázatok és mitigáció

1. **Túldrámatizált output**
   - Megoldás: emotion cap, karakterenként maximum intenzitás.
2. **Költségrobbanás (render idő + GPU)**
   - Megoldás: kétfázisú render + csak hibás részek újragenerálása.
3. **Jog és hangklónozás etika**
   - Megoldás: csak licencelt/szabályos hangmodellek, audit trail.
4. **Kiejtési hibák magyar nyelven**
   - Megoldás: folyamatosan bővülő pronunciation lexikon.

---

## 10. Gyakorlati minimum MVP (ha gyorsan indulnál)

Ha 2–3 hét alatt akarsz látványos javulást:

1. Szöveg normalizálás + dialógus-felismerés.
2. 3 hangulati címke (semleges/feszült/érzelmes).
3. Narrátor + max 4 fő karakter külön profil.
4. Auto loudness normalizálás + célzott újragenerálás.

Ezzel már jelentősen emberibb lesz a felolvasás, és később fokozatosan mélyíthető.

---

## 11. Döntési javaslat

A cél eléréséhez érdemes ezt termékként kezelni, nem egyszeri TTS-cserének:
- legyen külön **NLP/metaadat réteg**,
- legyen **rendezői vezérlés**,
- legyen **audio utómunka**,
- és legyen **mérhető minőségkontroll**.

Ettől kapsz olyan kimenetet, ami már nem „sablonos géphang”, hanem közelít a profi színészi előadás élményéhez.
