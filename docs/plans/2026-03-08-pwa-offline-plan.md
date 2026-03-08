# PWA & Offline Támogatás – Részletes Terv
**Dátum:** 2026-03-08
**Projekt:** Audiobook Platform – Mobile PWA & Offline
**Branch:** `claude/audiobook-production-research-tmcQo`

---

## Összefoglalás

Ez a dokumentum az audiobook platform teljes PWA (Progressive Web App) és offline
támogatásának tervét írja le. A cél: **mobilon böngészőből telepíthető app élmény**,
ahol a felhasználó könyveket és hangokat menthet le offline használathoz, a lejátszás
és olvasás internetkapcsolat nélkül is működik.

A tervezett megoldás **Next.js App Router + Serwist (Workbox-alapú Service Worker) +
IndexedDB + Cache API** kombinációján alapul. Nem natív appot, hanem egy natív
élményt nyújtó PWA-t építünk.

---

## 1. Technológiai Választások és Indoklások

### 1.1 Service Worker keretrendszer – `serwist`

```
npm install serwist @serwist/next
```

A `serwist` a Google Workbox modern, aktívan karbantartott forkja, teljes
Next.js App Router támogatással. Ez az egyetlen megbízható choice 2025-ben
Next.js 15+ App Router-hez.

**Miért nem vanilla Service Worker?**
Workbox/Serwist kezeli a cache verzióváltást, a precaching-et, és az összetett
caching stratégiákat – ezt kézzel megírni sok hiba forrása.

**Miért nem `next-pwa`?**
Az original `next-pwa` nem támogatja az App Router-t stabilan. A `serwist`
az utódja, kifejezetten erre fejlesztve.

### 1.2 Storage tartóssága – a valóság

A böngésző-alapú storage **alapból nem garantált tartós** – az OS, a böngésző
vagy a felhasználó törölheti. Egyetlen dolog változtat ezen:

```
await navigator.storage.persist()  // → true ha megadják
```

Ha a persist() **`true`** értékkel tér vissza, a böngésző megígéri, hogy
**nem törli az adatot automatikusan** (csak a user explicit törlésekor).
Chrome akkor adja meg, ha: a PWA telepítve van, a site könyvjelzőzve van,
vagy magas az engagement. Ez az **egyetlen legfontosabb hívás** az offline
megbízhatósághoz.

**Storage tartóssági hierarchia (persist() nélkül és után):**

| Tároló | Persist() nélkül | Persist() után | Audio seeking |
|---|---|---|---|
| **OPFS** | ✅ Legtartósabb (fájlrendszer szint) | ✅ Garantált | ✅ Blob URL-en át |
| **IndexedDB** | ⚠️ Törölhető nyomás alatt | ✅ Garantált | ✅ Blob URL-en át |
| **Cache API** | ⚠️ LRU eviction, legsérülékenyebb | ✅ Garantált | ✅ Natív |
| **localStorage** | ⚠️ Kis limit (~5MB), törölhető | ⚠️ Nem vonatkozik rá | ❌ |

**Következtetés:** A `persist()` megadása után Cache API is tartós – de az
**OPFS az optimális audio tárolóhely**, mert fájlrendszer szinten tárol,
nincs kvóta-verseny más storage-dzsal, és a legnagyobb fájlokra is skálázódik.

**A „Cache API-ban nincs Range request OPFS/IndexedDB-ből" tévhit:**
Az `<audio>` elem csak akkor igényel Range request-et, ha hálózati URL-t kap.
Ha `URL.createObjectURL(blob)`-ot kapva Blob URL-t kap, a böngésző **belsőleg
szimulál** Range request-et a Blob-ból – seeking működik. Ez Chrome, Firefox
és modern Safari esetén is igaz.

### 1.3 Offline adat-tárolás – rétegezett stratégia

```
npm install idb
```

| Tároló | Mit tárol | Miért |
|---|---|---|
| **OPFS** | Audio fájlok (.wav/.mp3) | Fájlrendszer szint, nagy fájl, tartós |
| **IndexedDB** | Metaadatok, fejezet szövegek, letöltési állapot, olvasási pozíció | Strukturált, async, query-k |
| **Cache API** | App shell, JS/CSS chunk-ok, fontkészlet, API JSON | Service Worker natív, precache-hez |
| **localStorage** | JWT token, UI beállítások | Szinkron, kis adat |

### 1.4 OPFS – Origin Private File System (az audio tárolója)

Az OPFS egy **böngésző-privát fájlrendszer** – natív fájlokként tárolja az
adatot, nem adatbázisként. Minden böngésző saját sandboxolt területe, a user
nem látja a Fájlkezelőben, de az app igen.

**Böngésző támogatás (2025):**
- Chrome Android 86+ ✅
- Safari iOS 15.2+ ✅
- Firefox Android 111+ ✅

**OPFS + Audio lejátszás flow:**

```typescript
// Mentés OPFS-be
async function saveAudioToOPFS(chapterId: number, audioBuffer: ArrayBuffer) {
  const root = await navigator.storage.getDirectory();
  const audioDir = await root.getDirectoryHandle("audio", { create: true });
  const fileHandle = await audioDir.getFileHandle(`chapter-${chapterId}.wav`, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(audioBuffer);
  await writable.close();
}

// Visszaolvasás + lejátszás (Blob URL-en át → seeking működik)
async function loadAudioFromOPFS(chapterId: number): Promise<string> {
  const root = await navigator.storage.getDirectory();
  const audioDir = await root.getDirectoryHandle("audio");
  const fileHandle = await audioDir.getFileHandle(`chapter-${chapterId}.wav`);
  const file = await fileHandle.getFile();           // File extends Blob
  return URL.createObjectURL(file);                  // <audio src={url}> → seeking ✅
}

// Törlés
async function deleteAudioFromOPFS(chapterId: number) {
  const root = await navigator.storage.getDirectory();
  const audioDir = await root.getDirectoryHandle("audio");
  await audioDir.removeEntry(`chapter-${chapterId}.wav`);
}
```

**Nagy fájlok írása Worker-ben (nem blokkolja a UI-t):**

```typescript
// OPFS synchronous access csak Dedicated Worker-ben érhető el
// → a letöltési logika Worker-be kerül, a fő szál blokkolás-mentes marad

// worker: opfs-worker.ts
const root = await navigator.storage.getDirectory();
const fileHandle = await root.getFileHandle(`chapter-${id}.wav`, { create: true });
const syncHandle = await fileHandle.createSyncAccessHandle();  // Worker-only API
syncHandle.write(new Uint8Array(buffer));
syncHandle.flush();
syncHandle.close();
```

### 1.5 Háttérletöltés – Background Fetch API

A Background Fetch API lehetővé teszi, hogy **az app bezárása után is fusson
a letöltés**. Ha a böngésző támogatja (Chrome Android, Edge), a nagy audio
fájlok letölthetők háttérben, miközben a user más alkalmazást használ.

Fallback: normál `fetch` + progress tracking, ha a browser nem támogatja.

### 1.6 Storage kezelés

- **`navigator.storage.persist()`**: tartós tárolás kérése – **elsők között hívandó**, OPFS első letöltésekor
- **`navigator.storage.estimate()`**: szabad hely és kvóta megjelenítése az UI-ban

---

## 2. PWA Manifest és Telepíthetőség

### 2.1 Web App Manifest

```json
// frontend/public/manifest.json
{
  "name": "Audiobook Reader",
  "short_name": "Audiobooks",
  "description": "Személyes audiobook könyvtár – olvasás és hallgatás egy helyen",
  "start_url": "/",
  "display": "standalone",
  "orientation": "any",
  "background_color": "#0F172A",
  "theme_color": "#6C8EF5",
  "lang": "hu",
  "categories": ["books", "education", "entertainment"],
  "icons": [
    { "src": "/icons/icon-72.png",   "sizes": "72x72",   "type": "image/png" },
    { "src": "/icons/icon-96.png",   "sizes": "96x96",   "type": "image/png" },
    { "src": "/icons/icon-128.png",  "sizes": "128x128", "type": "image/png" },
    { "src": "/icons/icon-144.png",  "sizes": "144x144", "type": "image/png" },
    { "src": "/icons/icon-192.png",  "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/icons/icon-512.png",  "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ],
  "screenshots": [
    {
      "src": "/screenshots/library-mobile.png",
      "sizes": "390x844",
      "type": "image/png",
      "form_factor": "narrow",
      "label": "Könyvtár nézet"
    },
    {
      "src": "/screenshots/reading-mobile.png",
      "sizes": "390x844",
      "type": "image/png",
      "form_factor": "narrow",
      "label": "Olvasási mód"
    }
  ],
  "shortcuts": [
    {
      "name": "Könyvtár",
      "url": "/",
      "icons": [{ "src": "/icons/shortcut-library.png", "sizes": "96x96" }]
    },
    {
      "name": "Legutóbbi könyv",
      "url": "/recent",
      "icons": [{ "src": "/icons/shortcut-recent.png", "sizes": "96x96" }]
    }
  ],
  "file_handlers": [
    {
      "action": "/upload",
      "accept": { "application/epub+zip": [".epub"] }
    }
  ]
}
```

**`file_handlers`**: Ha a user share-el egy `.epub` fájlt mobilon, az app megnyílik
és azonnal felajánlja a feltöltést. (Chrome Android 86+)

### 2.2 Next.js konfiguráció

```typescript
// frontend/next.config.ts
import withSerwist from "@serwist/next";

const withPWA = withSerwist({
  swSrc: "src/sw.ts",          // Service Worker forrás
  swDest: "public/sw.js",      // Build output
  disable: process.env.NODE_ENV === "development",
  reloadOnOnline: true,
});

export default withPWA({
  // meglévő next config
});
```

### 2.3 Layout – manifest és meta tagek

```tsx
// frontend/src/app/layout.tsx – <head> bővítése
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#6C8EF5" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="Audiobooks" />
<link rel="apple-touch-icon" href="/icons/icon-192.png" />
<!-- iPhone splash screens -->
<link rel="apple-touch-startup-image" href="/splash/iphone14pro.png"
      media="(device-width: 393px) and (device-height: 852px)" />
```

---

## 3. Service Worker Struktúra

```typescript
// frontend/src/sw.ts
import { defaultCache } from "@serwist/next/worker";
import { Serwist, CacheFirst, NetworkFirst, StaleWhileRevalidate } from "serwist";

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,   // App shell statikus fájlok
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [

    // 1. App shell: Next.js JS/CSS chunks – CacheFirst, hosszú TTL
    {
      matcher: /\/_next\/static\//,
      handler: new CacheFirst({
        cacheName: "next-static",
        plugins: [{ maxAgeSeconds: 30 * 24 * 60 * 60 }],
      }),
    },

    // 2. Google Fonts – CacheFirst
    {
      matcher: /^https:\/\/fonts\.(googleapis|gstatic)\.com/,
      handler: new CacheFirst({
        cacheName: "google-fonts",
        plugins: [{ maxAgeSeconds: 365 * 24 * 60 * 60, maxEntries: 30 }],
      }),
    },

    // 3. API: könyvlista, fejezet metaadatok – NetworkFirst, 24h fallback
    {
      matcher: /\/api\/(books|voices|users\/me\/settings)/,
      handler: new NetworkFirst({
        cacheName: "api-metadata",
        networkTimeoutSeconds: 5,
        plugins: [{ maxAgeSeconds: 24 * 60 * 60, maxEntries: 200 }],
      }),
    },

    // 4. Fejezet szöveg – StaleWhileRevalidate (ritkán változik)
    {
      matcher: /\/api\/books\/\d+\/chapters\/\d+\/text/,
      handler: new StaleWhileRevalidate({
        cacheName: "chapter-text",
        plugins: [{ maxAgeSeconds: 7 * 24 * 60 * 60, maxEntries: 500 }],
      }),
    },

    // 5. Audio fájlok – NEM Cache API-ban tároljuk!
    //    Az audio fájlokat OPFS-ben tárolja az OfflineManager.
    //    A SW csak akkor intercept-eli, ha a request OPFS-ből jön Blob URL-ként
    //    → ilyenkor a SW-nek nem kell tennie semmit, a Blob URL direkt elérhető.
    //    Ha valami mégis a hálózati audio URL-t kéri offline módban:
    {
      matcher: /\/static\/audio\//,
      handler: new NetworkOnly({
        // Ha nincs net és nincs OPFS fallback, a player jelzi a hibát.
        // Nem cache-elünk audio-t Cache API-ba – az OPFS az elsődleges tároló.
      }),
    },

    // 6. Voice sample/reference clips – kis fájlok, Cache API megfelelő
    {
      matcher: /\/static\/(voices|samples)\//,
      handler: new CacheFirst({
        cacheName: "voice-clips",
        plugins: [{ maxEntries: 100 }],
      }),
    },

    // 7. Navigáció – offline fallback oldal
    {
      matcher: ({ request }) => request.mode === "navigate",
      handler: new NetworkFirst({
        cacheName: "pages",
        plugins: [{ maxAgeSeconds: 24 * 60 * 60 }],
      }),
    },
  ],
  fallbacks: {
    document: "/offline",   // /offline statikus oldal, ha nincs net és nincs cache
  },
});

// Background Sync: olvasási pozíció mentése offline módban
serwist.addEventListeners();

// Background Fetch events
self.addEventListener("backgroundfetchsuccess", handleBgFetchSuccess);
self.addEventListener("backgroundfetchfail", handleBgFetchFail);
self.addEventListener("backgroundfetchabort", handleBgFetchAbort);

// Media Session frissítés üzenet kezelés
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
```

---

## 4. IndexedDB Séma – `idb` library

```typescript
// frontend/src/lib/offline-db.ts

import { openDB, DBSchema, IDBPDatabase } from "idb";

interface AudiobookDB extends DBSchema {

  // Offline mentett könyvek metaadatai
  "offline-books": {
    key: number;                      // book.id
    value: {
      id: number;
      title: string;
      author: string;
      language: string;
      chapter_count: number;
      cover_url: string | null;
      downloaded_at: string;          // ISO timestamp
      total_size_bytes: number;       // össz letöltött méret
      chapters_downloaded: number[];  // letöltött fejezet ID-k
      audio_chapters_downloaded: number[];
    };
  };

  // Fejezet szöveg tartalom (offline olvasáshoz)
  "chapter-texts": {
    key: string;                      // `${bookId}-${chapterId}`
    value: {
      book_id: number;
      chapter_id: number;
      title: string;
      text_content: string;
      cached_at: string;
    };
  };

  // Letöltési állapot per fejezet
  "download-queue": {
    key: string;                      // `${bookId}-${chapterId}-${type}` (type: text|audio)
    value: {
      book_id: number;
      chapter_id: number;
      type: "text" | "audio";
      status: "pending" | "downloading" | "done" | "failed";
      progress: number;               // 0–100
      size_bytes: number | null;
      error: string | null;
      bg_fetch_id: string | null;     // Background Fetch registration ID
    };
    indexes: { "by-book": number; "by-status": string };
  };

  // Offline mentett hangok
  "offline-voices": {
    key: number;                      // voice.id
    value: {
      id: number;
      name: string;
      language: string;
      source: string;
      sample_audio_url: string | null;
      reference_clip_url: string | null;
      downloaded_at: string;
    };
  };

  // Olvasási állapot (offline sync-hoz)
  "reading-states": {
    key: string;                      // `${userId}-${bookId}`
    value: {
      user_id: number;
      book_id: number;
      current_chapter_id: number;
      scroll_position: number;        // 0.0–1.0
      audio_position: number;         // másodperc
      voice_id: number | null;
      updated_at: string;
      synced: boolean;                // false = offline módosítás, sync szükséges
    };
  };

  // Storage quota tracking
  "storage-info": {
    key: string;                      // "quota"
    value: {
      quota_bytes: number;
      usage_bytes: number;
      last_checked: string;
    };
  };
}

let db: IDBPDatabase<AudiobookDB>;

export async function getDB() {
  if (!db) {
    db = await openDB<AudiobookDB>("audiobook-offline", 1, {
      upgrade(db) {
        db.createObjectStore("offline-books", { keyPath: "id" });
        db.createObjectStore("chapter-texts", { keyPath: undefined });
        const dlQueue = db.createObjectStore("download-queue");
        dlQueue.createIndex("by-book", "book_id");
        dlQueue.createIndex("by-status", "status");
        db.createObjectStore("offline-voices", { keyPath: "id" });
        db.createObjectStore("reading-states");
        db.createObjectStore("storage-info");
      },
    });
  }
  return db;
}
```

---

## 5. Offline Manager – Letöltési Logika

### 5.1 Letöltendő tartalmak könyvenként

```
Könyv offline mentésekor letöltődik:
├── Metaadatok (JSON) → IndexedDB
├── Borítókép → Cache API
├── Fejezet szövegek (összes) → IndexedDB
│   └── ~500KB – 3MB / könyv (szöveg)
└── Audio fájlok (fejezetek) → Cache API [audio-files]
    └── ~5–50MB / fejezet
    └── ~50–500MB / teljes könyv
```

Hang metaadatok (voice):
```
Hang offline mentésekor:
├── Voice metaadatok → IndexedDB
├── Reference clip (.wav) → Cache API [voice-clips]
└── Sample audio → Cache API [voice-clips]
```

### 5.2 OfflineManager osztály

```typescript
// frontend/src/lib/offline-manager.ts

export class OfflineManager {

  // Könyv teljes offline mentése
  async downloadBook(bookId: number, includeAudio: boolean, voiceId?: number) {
    const quota = await this.checkStorageQuota();
    if (!quota.hasSpace) throw new Error("Nincs elég tárhely");

    // 1. Metaadatok mentése
    const book = await getBook(bookId);
    const db = await getDB();
    await db.put("offline-books", { ...book, downloaded_at: new Date().toISOString(), ... });

    // 2. Fejezet szövegek letöltése (szekvenciálisan, progress tracking)
    for (const chapter of book.chapters) {
      await this.downloadChapterText(bookId, chapter.id);
    }

    // 3. Audio letöltés → OPFS-be mentés (nem Cache API-ba!)
    if (includeAudio && voiceId) {
      // persist() kérés az első letöltés előtt – kritikus!
      await navigator.storage.persist();

      const sw = await navigator.serviceWorker.ready;
      if ("backgroundFetch" in sw) {
        await this.startBackgroundFetch(bookId, voiceId);
      } else {
        await this.downloadAudioToOPFS(bookId, voiceId);
      }
    }
  }

  // Background Fetch → a SW backgroundfetchsuccess event-ben menti OPFS-be
  private async startBackgroundFetch(bookId: number, voiceId: number) {
    const audioUrls = await this.getAudioUrls(bookId, voiceId);
    const totalSize = await this.estimateAudioSize(audioUrls);
    const sw = await navigator.serviceWorker.ready;

    const registration = await (sw as any).backgroundFetch.fetch(
      `book-${bookId}-voice-${voiceId}`,
      audioUrls.map(a => a.url),
      {
        title: `Könyv letöltése...`,
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
        downloadTotal: totalSize,
      }
    );

    registration.addEventListener("progress", () => {
      const percent = registration.downloaded / registration.downloadTotal * 100;
      this.updateDownloadProgress(bookId, percent);
    });
  }

  // Fallback: normál fetch → OPFS-be írás (app előtérben kell maradjon)
  async downloadAudioToOPFS(bookId: number, voiceId: number) {
    const audioUrls = await this.getAudioUrls(bookId, voiceId);
    const root = await navigator.storage.getDirectory();
    const audioDir = await root.getDirectoryHandle("audio", { create: true });

    for (let i = 0; i < audioUrls.length; i++) {
      const { url, chapterId } = audioUrls[i];
      const response = await fetch(url, { headers: authHeaders() });
      const buffer = await response.arrayBuffer();

      const fileHandle = await audioDir.getFileHandle(`chapter-${chapterId}.wav`, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(buffer);
      await writable.close();

      this.updateDownloadProgress(bookId, (i + 1) / audioUrls.length * 100);
    }
  }

  // Audio URL visszaadása lejátszáshoz: OPFS → Blob URL → seeking ✅
  async getAudioSrc(chapterId: number): Promise<string> {
    try {
      const root = await navigator.storage.getDirectory();
      const audioDir = await root.getDirectoryHandle("audio");
      const fileHandle = await audioDir.getFileHandle(`chapter-${chapterId}.wav`);
      const file = await fileHandle.getFile();
      return URL.createObjectURL(file);   // Blob URL, browser kezeli a Range-et
    } catch {
      // Nincs OPFS-ben → hálózatról (online mód)
      return `${API_BASE}/static/audio/chapter-${chapterId}.wav`;
    }
  }

  // Hang offline mentése
  async downloadVoice(voiceId: number) {
    const voice = await getVoice(voiceId);
    const db = await getDB();
    const cache = await caches.open("voice-clips");

    // Metaadatok
    await db.put("offline-voices", { ...voice, downloaded_at: new Date().toISOString() });

    // Reference clip és sample audio
    if (voice.reference_clip_path) {
      const url = `${API_BASE}/static/${voice.reference_clip_path}`;
      await cache.add(url);
    }
    if (voice.sample_audio_path) {
      const url = `${API_BASE}/static/${voice.sample_audio_path}`;
      await cache.add(url);
    }
  }

  // Storage quota lekérdezés
  async checkStorageQuota(): Promise<{ used: number; quota: number; hasSpace: boolean }> {
    const estimate = await navigator.storage.estimate();
    const used = estimate.usage || 0;
    const quota = estimate.quota || 0;
    const FREE_THRESHOLD = 100 * 1024 * 1024;  // min. 100MB szabadon kell
    return { used, quota, hasSpace: (quota - used) > FREE_THRESHOLD };
  }

  // Tartós tárolás kérése (OS ne törölje automatikusan)
  async requestPersistentStorage(): Promise<boolean> {
    if (navigator.storage?.persist) {
      return await navigator.storage.persist();
    }
    return false;
  }

  // Könyv törlése offline tárhelyről
  async removeBook(bookId: number, removeAudio = true) {
    const db = await getDB();
    await db.delete("offline-books", bookId);

    // Chapter texts törlése
    const tx = db.transaction("chapter-texts", "readwrite");
    // ... törlés by book_id

    if (removeAudio) {
      const cache = await caches.open("audio-files");
      const urls = await this.getAudioUrls(bookId);
      for (const url of urls) await cache.delete(url);
    }
  }
}
```

### 5.3 Background Sync – olvasási pozíció

```typescript
// sw.ts – Background Sync az olvasási állapot szinkronizálásához
self.addEventListener("sync", async (event) => {
  if (event.tag === "sync-reading-states") {
    event.waitUntil(syncReadingStates());
  }
});

async function syncReadingStates() {
  const db = await getDB();
  const unsyncedStates = await db.getAllFromIndex("reading-states", "synced", false);
  // Ha van internet, felküldi az összes offline módosítást
  for (const state of unsyncedStates) {
    await fetch("/api/reading/", {
      method: "PUT",
      body: JSON.stringify(state),
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getToken()}` }
    });
    await db.put("reading-states", { ...state, synced: true });
  }
}
```

---

## 6. UI Komponensek

### 6.1 Letöltés gomb a BookCard-on

```
┌──────────────────────────────┐
│  📚 Háború és Béke           │
│  Tolsztoj · 361 fejezet      │
│                              │
│  [▶ Olvasás]  [⬇ Offline]   │
└──────────────────────────────┘

Letöltés közben:
┌──────────────────────────────┐
│  📚 Háború és Béke           │
│  Tolsztoj · 361 fejezet      │
│  ████████░░░░░░ 54%          │
│  [✕ Megszakít]  [⚡ Háttérben]│
└──────────────────────────────┘

Letöltve:
┌──────────────────────────────┐
│  📚 Háború és Béke           │
│  Tolsztoj · 361 fejezet      │
│  ✓ Offline elérhető · 312MB  │
│  [▶ Olvasás]  [🗑 Törlés]   │
└──────────────────────────────┘
```

### 6.2 Offline letöltés modal

Letöltés gomb megnyomásakor:

```
┌─────────────────────────────────────────┐
│  📥 Offline letöltés                    │
├─────────────────────────────────────────┤
│  📖 Szöveg (olvasáshoz)                 │
│     ~2.4MB – mindig letöltődik          │
│                                         │
│  🔊 Audio (hallgatáshoz)                │
│  [✓] Magyar hang (Kovács Péter)         │
│  [ ] Angol hang (Sarah)                 │
│                                         │
│  Becsült méret: 287MB                   │
│  Szabad hely: 1.2GB                     │
│  ████████████████░░░░ 68% tele          │
│                                         │
│  💡 Az app bezárható, a letöltés        │
│     háttérben folytatódik.              │
│                                         │
│  [Mégse]         [⬇ Letöltés indítása] │
└─────────────────────────────────────────┘
```

### 6.3 Storage kezelő oldal (`/settings/offline`)

```
💾 Offline tartalmak

Felhasznált tárhely: 1.4GB / 4GB
████████░░░░░░░░░░░░ 35%

[⚙ Tartós tárolás engedélyezve ✓]

┌──────────────────────────────────────────┐
│ 📚 Offline könyvek                       │
├──────────────────────────────────────────┤
│ Háború és Béke         312MB  [🗑]       │
│ A kis herceg (text)     1.2MB  [🗑]      │
│ Drakula               189MB  [🗑]       │
├──────────────────────────────────────────┤
│ 🎙 Offline hangok                        │
├──────────────────────────────────────────┤
│ Kovács Péter            8.4MB  [🗑]      │
│ Sarah (EN)              6.1MB  [🗑]      │
├──────────────────────────────────────────┤
│              [🗑 Összes törlése]          │
└──────────────────────────────────────────┘
```

### 6.4 Offline indicator a Navbar-ban

```
Normál:    [nincs indicator]
Offline:   🔴 Offline mód  (piros chip a nav jobb sarkában)
Szinkron.: 🔄 Szinkronizálás...
```

### 6.5 Telepítési prompt (Install Banner)

```
┌──────────────────────────────────────────┐
│  📱 App telepítése                        │
│  Telepítsd az Audiobookot a kezdőképer-  │
│  nyőre a jobb élményért!                 │
│                  [Mégse]  [Telepítés ▶] │
└──────────────────────────────────────────┘
```

Megjelenik: 3. látogatás után, ha a user nem utasította el, és az app nincs telepítve.

---

## 7. Media Session API – Lock Screen Player

A Media Session API biztosítja, hogy az audio lejátszás vezérelhető legyen
**lezárt képernyőről, értesítési panelből és Bluetooth fejhallgatóról**.

```typescript
// frontend/src/lib/media-session.ts

export function updateMediaSession(chapter: Chapter, book: Book, coverUrl: string) {
  if (!("mediaSession" in navigator)) return;

  navigator.mediaSession.metadata = new MediaMetadata({
    title: chapter.title,
    artist: book.author,
    album: book.title,
    artwork: [
      { src: coverUrl, sizes: "512x512", type: "image/png" },
    ],
  });

  navigator.mediaSession.setActionHandler("play",          () => audioRef.current?.play());
  navigator.mediaSession.setActionHandler("pause",         () => audioRef.current?.pause());
  navigator.mediaSession.setActionHandler("seekbackward",  () => seek(-10));
  navigator.mediaSession.setActionHandler("seekforward",   () => seek(+10));
  navigator.mediaSession.setActionHandler("previoustrack", () => goToPrevChapter());
  navigator.mediaSession.setActionHandler("nexttrack",     () => goToNextChapter());
  navigator.mediaSession.setActionHandler("seekto",        (e) => seekTo(e.seekTime!));
}

export function updatePositionState(currentTime: number, duration: number) {
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.setPositionState({
    duration,
    playbackRate: currentPlaybackRate,
    position: currentTime,
  });
}
```

**Eredmény:** Android/iOS értesítési panelen és lezárt képernyőn megjelenik a
könyv neve, szerző, borítókép, lejátszás/szünet/előre/vissza gombok.

---

## 8. Offline Olvasás Fejezet Szöveg

Ha a felhasználó offline módban van, de a fejezet szövege le van töltve:

```typescript
// api.ts – offline-aware fejezet szöveg lekérés
export async function getChapterTextOffline(bookId: number, chapterId: number) {
  // 1. Próbál hálózatról
  if (navigator.onLine) {
    try {
      return await getChapterText(bookId, chapterId);
    } catch {}
  }

  // 2. IndexedDB fallback
  const db = await getDB();
  const cached = await db.get("chapter-texts", `${bookId}-${chapterId}`);
  if (cached) return cached;

  // 3. Service Worker Cache fallback (ha SW cachelte)
  const cache = await caches.open("chapter-text");
  const response = await cache.match(`/api/books/${bookId}/chapters/${chapterId}/text`);
  if (response) return response.json();

  throw new Error("Fejezet nem érhető el offline módban");
}
```

---

## 9. Offline Oldal

```tsx
// frontend/src/app/offline/page.tsx
// Statikus oldal, amit a Service Worker tud szolgálni internet nélkül

export default function OfflinePage() {
  return (
    <div>
      <h1>📵 Nincs internetkapcsolat</h1>
      <p>Nem sikerült betölteni az oldalt.</p>
      <p>Ha offline könyveket töltöttél le, <a href="/">nyisd meg a könyvtárat</a>.</p>
      <button onClick={() => window.location.reload()}>Újrapróbálkozás</button>
    </div>
  )
}
```

---

## 10. Böngésző Kompatibilitás

| Feature | Chrome Android | Safari iOS | Firefox Android |
|---|---|---|---|
| Service Worker | ✅ | ✅ (iOS 16.4+) | ✅ |
| Cache API | ✅ | ✅ | ✅ |
| IndexedDB | ✅ | ✅ | ✅ |
| **OPFS** | ✅ (Chrome 86+) | ✅ (iOS 15.2+) | ✅ (111+) |
| **OPFS sync (Worker)** | ✅ | ✅ | ✅ |
| Background Fetch | ✅ | ❌ | ❌ |
| Background Sync | ✅ | ❌ | ❌ |
| Media Session | ✅ | ✅ (iOS 15+) | ✅ |
| PWA Install (A2HS) | ✅ | ✅ (Share menu) | ✅ |
| `navigator.storage.persist()` | ✅ | ⚠️ korlátozott | ✅ |
| File Handlers | ✅ | ❌ | ❌ |
| Maskable Icons | ✅ | ✅ | ✅ |

**OPFS iOS megjegyzés:** iOS 15.2-től elérhető, de a szinkron `createSyncAccessHandle()`
Worker-ben fut – ez a mi architektúránkban is így van, tehát iOS-on is teljes OPFS
támogatás érhető el.

**iOS-specifikus korlátozások:**
- Safari iOS-on a PWA csak a „Share → Képernyőre adás" menüből telepíthető
  (nincs natív install banner) → célzott iOS onboarding szükséges
- Storage limit iOS-on: max. 50GB (Safari kezeli), de az OS törölheti
  ha tárhely fogy → `navigator.storage.persist()` kérése kötelező
- Background Fetch nem elérhető iOS-on → a letöltésnek az app előtérben
  kell lennie iOS-on; ezt jelezni kell a user felé

**Fallback stratégia:**
- Background Fetch nincs → normál fetch + "tartsd nyitva az appot" üzenet
- Background Sync nincs → `visibilitychange` + `beforeunload` alapú sync

---

## 11. Storage Méretbecslések és Limitek

| Tartalom | Méret / egység | Tipikus könyvtár (10 könyv) |
|---|---|---|
| Fejezet szöveg (1 könyv) | 0.5–3MB | 5–30MB |
| Audio (1 fejezet, ~30 perc) | 15–45MB (WAV) / 3–8MB (MP3) | – |
| Audio (teljes könyv, 10h) | 300–900MB (WAV) / 60–160MB (MP3) | 600MB–1.6GB |
| Voice reference clip | 1–5MB | 10–50MB (5 hang) |
| App shell + statikus fájlok | ~5MB | 5MB |

**Javaslat:** Az audio formátumát a backend oldal határozza meg. Ha PWA offline
elsődleges cél, érdemes **MP3 vagy AAC** generálást is támogatni a WAV mellett
– ez 4–10× kisebb fájlméretet jelent mobilon.

**Javasolt limitek az UI-ban:**
- Figyelmeztetés, ha a letöltés > 500MB
- Letiltás, ha < 200MB szabad hely marad

---

## 12. Implementációs Ütemterv

### Phase 1 – PWA Alap (1 hét)

- [ ] `serwist` + `@serwist/next` telepítése
- [ ] `manifest.json` elkészítése (ikonok, shortcuts, file_handlers)
- [ ] App ikonok generálása (72, 96, 128, 144, 192, 512px) – maskable verzió
- [ ] iOS splash screen képek
- [ ] `sw.ts` Service Worker alap caching stratégiákkal
- [ ] Offline fallback oldal (`/offline`)
- [ ] Navbar offline indicator (`navigator.onLine` + `online`/`offline` events)
- [ ] Install prompt komponens (3. látogatás után)

### Phase 2 – IndexedDB és Offline Adatbázis (1 hét)

- [ ] `idb` telepítése, DB séma implementálása (`offline-db.ts`)
- [ ] `OfflineManager` osztály – book letöltési logika
- [ ] `OfflineManager` – voice letöltési logika
- [ ] Fejezet szöveg offline cache (IndexedDB)
- [ ] `getChapterTextOffline` offline-aware wrapper

### Phase 3 – Letöltés UI (1 hét)

- [ ] BookCard letöltés gomb + progress bar
- [ ] Letöltés modal (méretbecslés, hang választó)
- [ ] `/settings/offline` storage kezelő oldal
- [ ] `navigator.storage.estimate()` vizualizáció
- [ ] `navigator.storage.persist()` kérés (könyv első letöltésekor)
- [ ] Background Fetch progress (Chrome Android)
- [ ] Letöltési queue kezelés (egy időben max. 3 fejezet)

### Phase 4 – Media Session és Lock Screen Player (3 nap)

- [ ] Media Session API integráció a ChapterPlayer-be
- [ ] Könyv borítókép generálás/placeholder (EPUB cover extraction)
- [ ] `setPositionState` valós idejű pozíció frissítés
- [ ] Bluetooth / fejhallgató gombok kezelése

### Phase 5 – Background Sync és Olvasási Állapot (3 nap)

- [ ] IndexedDB `reading-states` store
- [ ] Offline írás → `synced: false` jelzés
- [ ] Background Sync registration (`sync-reading-states`)
- [ ] Online eseményre sync trigger (fallback)
- [ ] Konfliktusmegoldás: timestamp alapú (legújabb wins)

### Phase 6 – iOS Optimalizáció és Tesztelés (1 hét)

- [ ] iOS install instrukciók (Share menü tutorial overlay)
- [ ] Safari storage persist warning és kezelés
- [ ] iOS audio policy kezelés (felhasználói interakció szükséges az első lejátszáshoz)
- [ ] Tesztelés: Chrome Android, Safari iOS, Firefox Android
- [ ] Tesztelés: Repülőgép mód (valódi offline teszt)
- [ ] Lighthouse PWA audit → 100 pont cél

---

## 13. Lighthouse PWA Audit Célok

| Metrika | Cél |
|---|---|
| Performance | ≥ 90 |
| Accessibility | ≥ 95 |
| Best Practices | ≥ 95 |
| SEO | ≥ 90 |
| PWA | ✅ Installable |
| PWA | ✅ Works offline |
| PWA | ✅ Fast on 3G |

---

## 14. Fájlstruktúra (létrehozandó)

```
frontend/
├── public/
│   ├── manifest.json                    # Web App Manifest
│   ├── sw.js                            # Build által generált (serwist output)
│   ├── offline.html                     # Statikus offline fallback
│   ├── icons/
│   │   ├── icon-72.png
│   │   ├── icon-96.png
│   │   ├── icon-128.png
│   │   ├── icon-144.png
│   │   ├── icon-192.png                 # Maskable
│   │   ├── icon-512.png                 # Maskable
│   │   ├── shortcut-library.png
│   │   └── shortcut-recent.png
│   └── splash/
│       ├── iphone14pro.png
│       └── ipad.png
├── src/
│   ├── sw.ts                            # Service Worker forrás
│   ├── lib/
│   │   ├── offline-db.ts               # IndexedDB séma (idb)
│   │   ├── offline-manager.ts          # Letöltési logika (OPFS + BG Fetch)
│   │   ├── opfs-worker.ts              # Dedicated Worker: OPFS szinkron írás
│   │   ├── media-session.ts            # Media Session API wrapper
│   │   └── storage-utils.ts            # Quota, persist helpers
│   ├── components/
│   │   ├── DownloadButton.tsx           # Letöltés gomb + progress
│   │   ├── DownloadModal.tsx            # Letöltés beállítások modal
│   │   ├── OfflineIndicator.tsx         # Navbar offline chip
│   │   ├── InstallPrompt.tsx            # PWA telepítési banner
│   │   └── StorageBar.tsx              # Tárhelyhasználat vizualizáció
│   └── app/
│       ├── offline/
│       │   └── page.tsx                 # Offline fallback oldal
│       └── settings/
│           └── offline/
│               └── page.tsx             # Storage kezelő oldal
└── next.config.ts                       # Serwist integráció
```

---

## 15. Kapcsolódó Tervek

- **[2026-03-08-reading-experience-improvement-plan.md](./2026-03-08-reading-experience-improvement-plan.md)**
  – Olvasási UX terv (font, reading mode, pozíció mentés) – a PWA-val együtt implementálandó

---

*Terv készítője: Claude Code AI Assistant*
*Utolsó frissítés: 2026-03-08*
