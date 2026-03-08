# Olvasási élmény javítási terv (Audiobook app)

**Dátum:** 2026-03-08  
**Fókusz:** könyvolvasási élmény jelentős javítása, személyre szabható tipográfia, fókuszált olvasás mód, szinkronizált előrehaladás mentés, teljes körű PWA és offline mobil élmény.

## 1. Célok és sikerkritériumok

### Elsődleges célok
1. **Prémium olvashatóság**: a felhasználó a számára legkomfortosabb fonttal, betűmérettel és szóközzel olvashasson.
2. **Fókuszált olvasás mód**: teljes képernyős chapter-olvasás, miközben az audio lejátszó fixen alul elérhető marad.
3. **Megszakítás nélküli folytatás**: az alkalmazás mentse és állítsa vissza a **szöveges olvasási pozíciót** és az **audio lejátszási pozíciót** könyvenként.
4. **UX minőségemelés**: mérhetően jobb komfort, kevesebb kognitív terhelés, gyorsabb visszatérés a tartalomhoz.

### KPI / mérés
- Olvasás mód aktiválási arány.
- Átlagos olvasási session hossz.
- Visszatérési arány (24h/7 nap).
- „Folytatás” gomb használati arány.
- Beállítások módosítási gyakoriság (font, méret, spacing).

---

## 2. Scope (kötelező elemek)

## 2.1 Fontválasztás a user settingsben

### Követelmény
- A felhasználó választhasson több, olvasásra optimalizált font közül a beállításokban.
- A választás perzisztálódjon (profilhoz kötve, fallbackként local storage).

### Javasolt fontkészlet
- **Irodalmi / print jellegű serif**: Literata, Source Serif 4, Merriweather.
- **Modern sans opciók**: Inter, Atkinson Hyperlegible, Noto Sans.
- **Diszlexia-barát opció** (ha licenc/brand engedi): Atkinson Hyperlegible vagy OpenDyslexic alternatíva.

### UX részletek
- Élő preview mondat a settings panelen.
- „Ajánlott” badge a legjobban olvasható opciókon.
- 1 kattintásos „Alapérték visszaállítása”.

---

## 2.2 Olvasás közbeni állítható betűméret

### Követelmény
- Olvasás közben gyorsan (nem csak settingsben) állítható legyen a betűméret.

### Javasolt megvalósítás
- Floating mini toolbar: `A-` / `A+`, plusz csúszka.
- Tartomány: **14–30 px**, default: 18 px.
- Azonnali vizuális frissítés újratöltés nélkül.

### UX részletek
- Finom lépésköz: 1 px.
- Presetek: S / M / L.
- Billentyűparancs desktopon (`Ctrl/Cmd +` és `Ctrl/Cmd -`).

---

## 2.3 Olvasás mód (fókuszált chapter nézet, fix alsó audio)

### Követelmény
- „Reading Mode” bekapcsolásakor az aktuális chapter teljes képernyőn jelenjen meg.
- Az audio player **fixen alul** maradjon, folyamatosan kezelhető módon.

### Javasolt UI viselkedés
- Header minimalizálás, zavaró elemek elrejtése.
- Sorköz, margó, max-szélesség olvasásra optimalizálva.
- Kapitel navigáció (előző/következő chapter) gyorsgombokkal.

### Technikai elv
- Sticky/fixed alsó lejátszó saját z-index rétegen.
- Chapter konténer: full viewport magasság, görgethető tartalom.
- Mobilon safe-area figyelembevétele (bottom padding a player magassága miatt).

---

## 2.4 Szóköz távolság szabályozása

### Követelmény
- A felhasználó tudja állítani a szavak közötti távolságot.

### Javasolt beállítás
- CSS `word-spacing` skála: **0px – 0.2em**.
- Presetek: Normál / Kényelmes / Tág.

### Megjegyzés
- Szóköz állítás mellett külön opcióként később ajánlott a **line-height** és **letter-spacing** is (olvasási komfort miatt).

---

## 2.5 Olvasási és lejátszási előrehaladás mentése könyvenként

### Követelmény
- Menteni kell az adott könyvnél:
  - utolsó olvasási pozíciót (chapter + offset/anchor),
  - utolsó audio pozíciót (időbélyeg),
  - utolsó megnyitás idejét.
- Visszatéréskor „Folytatás innen” élmény.

### Adatmodell javaslat
- `user_book_progress`
  - `user_id`
  - `book_id`
  - `chapter_id`
  - `reading_anchor` (pl. DOM anchor / bekezdés index + offset)
  - `audio_position_seconds`
  - `updated_at`

### Mentési stratégia
- Debounce (pl. 3–5 mp) olvasás és lejátszás közben.
- Hard save események: chapter váltás, tab bezárás, app háttérbe kerül.
- Offline fallback local storage, majd szerverrel szinkron első adandó alkalommal.

---

## 3. Plusz minőség- és élményjavító feature javaslatok

1. **Theme módok**: világos / sötét / szépia háttér.
2. **Line-height és margó szabályzó**: személyre szabott olvasási ritmus.
3. **„Focus line” mód**: halványítja a többi sort, az aktuális sor jobban kiemelt.
4. **Olvasási idő becslés** chapterenként (pl. „~7 perc”).
5. **Smart Continue CTA**: nyitáskor egyértelmű „Folytasd itt” blokk.
6. **Auto-scroll mód** (opcionális): állítható sebességgel.
7. **Könyvjelző és jegyzet**: gyors jelölés + kereshető komment.
8. **Szójelölés és mini-szótár**: kijelölt szóhoz jelentés/fordítás (ha támogatott).
9. **Sync highlight audio-val**: ha van időzített transcript, olvasott rész kiemelése.
10. **Mikrointerakciók**: finom animációk váltáskor, de diszkréten.

---

## 4. UX irányelvek a „legjobb élményhez”

- **Low-friction első használat**: alapértelmezett, jól olvasható preset azonnal működjön.
- **Gyors finomhangolás**: minden tipográfiai beállítás 1-2 érintésből elérhető.
- **Context megtartása**: bármit állít a user, ne ugorjon el a jelenlegi olvasási pozíció.
- **Stabilitás**: lejátszó vezérlés mindig látható és megbízható.
- **Akadálymentesség**: minimum kontraszt, billentyűzet-navigáció, screen reader label-ek.

---

## 5. Implementációs fázisok

## Fázis 1 — Tipográfia és settings alapok
- Font selector + live preview.
- Betűméret állítás (settings + olvasás közbeni toolbar).
- Word-spacing vezérlő.
- Perzisztencia user profile/local storage szinten.

**Eredmény:** láthatóan testreszabható olvasási felület.

## Fázis 2 — Reading mode
- Teljes képernyős chapter nézet.
- Fix alsó audio player integráció.
- Fókusz UI, minimal header, optimalizált margók.

**Eredmény:** zavartalan, immerszív olvasás + folyamatos audio kontroll.

## Fázis 3 — Progress mentés és visszaállítás
- Backend progress endpoint(ok) / adattábla.
- Frontend progress tracker (scroll + audio).
- „Folytasd innen” belépési élmény.

**Eredmény:** megszakítás nélküli, eszközök között konzisztens folytatás.

## Fázis 4 — Prémium UX finomhangolás
- Theme módok, line-height, margók.
- Könyvjelző/jegyzet (minimum verzió).
- Telemetria + A/B teszt a presetekre.

**Eredmény:** magasabb megtartás és magasabb elégedettség.

---

## 6. Kockázatok és mitigáció

- **Layout törés extrém font/beállítás mellett** → max/min korlátok, vizuális regression teszt.
- **Pontatlan olvasási pozíció mentés** → anchor-alapú + fallback százalékos pozíció.
- **Túl sok opció miatti komplexitás** → progresszív disclosure (basic / advanced).
- **Mobil viewport problémák fixed playerrel** → safe-area tesztek iOS/Androidon.

---

## 7. Elfogadási kritériumok (Definition of Done)

1. User settingsben működő fontválasztó, perzisztált mentéssel.
2. Olvasás közben állítható betűméret valós idejű visszajelzéssel.
3. Reading mode teljes képernyős chapterrel, fix alsó audio playerrel.
4. Állítható szóköz távolság, látható hatással.
5. Könyvenként mentett és visszaállított olvasási + audio progress.
6. Legalább 1 „Folytasd innen” belépési pont a könyv megnyitásakor.

---

## 8. Javasolt backlog sorrend (prioritás)

1. Progress mentés alapmodell + API.
2. Reading mode UI shell + fix player stabilitás.
3. Font selector + méret + word-spacing kontrollek.
4. Continue UX és mikrointerakciók.
5. Prémium kiegészítők (theme, notes, highlight sync).


---

## 9. Teljes körű PWA támogatás (offline olvasás és hallgatás)

### 9.1 Cél
- Az app **installálható PWA-ként** működjön mobilon és desktopon.
- A felhasználó internet nélkül is tudjon:
  - letöltött könyvet olvasni,
  - letöltött audio chaptereket hallgatni,
  - ott folytatni, ahol abbahagyta.

### 9.2 Kötelező PWA elemek
1. **Web App Manifest**
   - Név, rövid név, ikonok (192/512), `display: standalone`, theme/background színek.
   - App shortcutok: „Folytatás”, „Könyvtár”, „Letöltések”.
2. **Service Worker (SW)**
   - App shell cache (HTML/CSS/JS/font/icon).
   - Runtime cache API hívásokhoz és statikus erőforrásokhoz.
   - Offline fallback oldalak és UI állapotok.
3. **Install UX**
   - „Telepítés” CTA megfelelő időben (nem tolakodó).
   - Telepítés után rövid onboarding az offline funkciókról.

### 9.3 Offline tartalomstratégia

#### Olvasási tartalom
- Chapter szövegek IndexedDB-ben tárolva könyvenként/chapterenként.
- Verziózott tartalom (`content_version`) a frissítések kezelésére.
- Delta frissítés preferált (ha backend támogatja), különben chapter-szintű újrahúzás.

#### Audio tartalom
- Audio fájlok chunkolt vagy chapter szintű letöltése.
- Letöltési profilok:
  - **Eco** (alacsonyabb bitráta),
  - **Standard**,
  - **High** (Wi-Fi ajánlott).
- Tárhely limit figyelés és „smart cleanup” (régen hallgatott elemek archiválása/törlése).

### 9.4 Cache policy (javaslat)
- **App shell**: cache-first.
- **Könyv metadata / könyvtár**: stale-while-revalidate.
- **Chapter text**: network-first online, offline fallback IndexedDB.
- **Audio stream/asset**: cache-first letöltött tartalomnál, különben network.

### 9.5 Offline progress és szinkron
- Progress mentés offline queue-ba (olvasási anchor + audio timestamp).
- Újra online állapotban konfliktuskezelés:
  - alapértelmezett: **latest update wins**,
  - opcionális: „melyik eszköz állását tartod meg?” feloldó modal.
- Sync státusz kijelzés: „Utolsó szinkron: 3 perce”.

### 9.6 Mobil UX internet nélkül ("fantasztikus élmény")
- Egyértelmű offline badge és kapcsolat státusz.
- Letöltések képernyő:
  - könyvenkénti foglaltság,
  - hátralévő tárhely,
  - batch műveletek (szünet/törlés/prioritás).
- Gyorsindítás: app megnyitásakor automatikus „Folytatás offline” CTA, ha nincs net.
- Audio vezérlés lock-screen / background támogatással (platform korlátok figyelembevételével).
- Alacsony akkumulátor mód jelzése és energiatakarékos opció (pl. animációk csökkentése).

### 9.7 Technikai architektúra (rövid)
- **Storage**
  - IndexedDB: chapter text, beállítások, progress queue.
  - Cache Storage: app shell + média cache.
- **Sync engine**
  - Background Sync (ha támogatott), fallback foreground retry.
- **Download manager**
  - Soros/párhuzamos letöltés limit,
  - újrapróbálás exponenciális visszalépéssel,
  - megszakítás utáni folytatás.

### 9.8 Biztonság és jogosultság
- Titkosított transport (HTTPS kötelező a PWA/SW miatt).
- Lokálisan tárolt tokenek minimalizálása, rövid élettartamú session stratégia.
- DRM/licenc-érzékeny audio esetén opcionális védett URL/token rotáció.

### 9.9 Minőségbiztosítás (PWA specifikus)
- Lighthouse PWA audit cél: 90+.
- Tesztmátrix:
  - Android Chrome,
  - iOS Safari (korlátozott PWA képességek külön ellenőrzéssel),
  - Desktop Chrome/Edge.
- Szenáriók:
  - telepítés,
  - offline első indítás,
  - részleges letöltés,
  - sync konfliktus,
  - alacsony tárhely.

### 9.10 PWA-hoz kapcsolódó elfogadási kritériumok
1. Az app telepíthető és standalone módban stabilan fut.
2. Legalább 1 teljes könyv (szöveg + audio) offline elérhető.
3. Offline olvasási és hallgatási progress mentés működik, majd online szinkronizál.
4. A felhasználó látja a letöltési és szinkron státuszát.
5. Gyenge vagy nulla hálózaton is megmarad a folyamatos, akadásmentes alapélmény.

---

## 10. Bővített ütemezés (PWA-val)

1. **P0 Alap**: manifest + SW + app shell cache + telepítés UX.
2. **P1 Offline olvasás**: chapter letöltés, IndexedDB, offline chapter megnyitás.
3. **P2 Offline audio**: download manager, minőségprofilok, tárhelykezelés.
4. **P3 Offline progress sync**: queue, konfliktuskezelés, sync státusz UI.
5. **P4 Polishing**: lock-screen controls, battery saver UX, telemetria + optimalizálás.
