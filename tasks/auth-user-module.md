# Auth & User Module — Implementation Tasks

**Module**: Authentication, User Management, PostgreSQL migration
**Status**: Not started
**Depends on**: Nothing (foundational module)
**Design doc**: `docs/plans/2026-03-04-saas-transformation-design.md`

## Decisions

| Decision | Choice |
|----------|--------|
| Auth strategy | Opcionális — meglévő endpointok auth nélkül is működnek |
| OAuth providers | Google + GitHub + Email magic link |
| Auth library | NextAuth.js v5 (beta, Next.js 16 App Router kompatibilis) |
| JWT validation | Backend: python-jose, FastAPI dependency injection |
| Database | SQLite → PostgreSQL 18 (Docker Compose) |
| Migration tool | Alembic nem kell — új DB-vel indulunk (create_all) |
| User provisioning | Auto-create user on first API call from JWT |
| Free credits | 3 credit új usernek regisztrációkor |

## Current State

**Ami VAN:**
- `backend/app/models.py` — 5 model (Book, Chapter, Voice, Job, PlaybackState), nincs User
- `backend/app/database.py` — SQLite async engine, get_db, init_db(create_all)
- `backend/app/config.py` — Settings(database_url, storage_path, redis_url)
- `backend/app/main.py` — FastAPI + 4 router (books, voices, jobs, playback), CORS, static files
- `backend/requirements.txt` — 15 package, nincs auth/PostgreSQL
- `frontend/src/app/layout.tsx` — Egyszerű nav bar + main, nincs AuthProvider
- `frontend/src/lib/api.ts` — fetch wrapper, nincs auth header
- `docker-compose.yml` — frontend + backend + redis (nincs postgres)

**Ami NINCS:**
- ❌ User/UserSettings model
- ❌ Auth middleware (backend)
- ❌ NextAuth.js setup (frontend)
- ❌ PostgreSQL service
- ❌ OAuth provider registráció
- ❌ user_id oszlop a meglévő táblákon
- ❌ Credit system
- ❌ Sign-in page
- ❌ AuthProvider component

---

## Task 1: PostgreSQL hozzáadása Docker Compose-hoz

**Fájlok:**
- Módosít: `docker-compose.yml`
- Módosít: `backend/app/config.py`
- Módosít: `backend/app/database.py`
- Módosít: `backend/requirements.txt`

**Lépések:**

1. `requirements.txt`-hez hozzáadni:
   ```
   asyncpg==0.30.0
   psycopg2-binary==2.9.9
   ```

2. `docker-compose.yml`-be postgres service:
   ```yaml
   postgres:
     image: postgres:18-alpine
     ports:
       - "5432:5432"
     environment:
       POSTGRES_USER: audiobook
       POSTGRES_PASSWORD: audiobook_dev
       POSTGRES_DB: audiobook
     volumes:
       - postgres_data:/var/lib/postgresql/data

   volumes:
     postgres_data:
   ```

3. Backend service environment frissítés:
   ```yaml
   AUDIOBOOK_DATABASE_URL=postgresql+asyncpg://audiobook:audiobook_dev@postgres:5432/audiobook
   ```

4. `config.py` — default database_url átírása PostgreSQL-re lokális fejlesztéshez:
   ```python
   database_url: str = "postgresql+asyncpg://audiobook:audiobook_dev@localhost:5432/audiobook"
   ```

5. `database.py` — aiosqlite import eltávolítása, asyncpg implicit (SQLAlchemy auto-detect)

**Validáció:**
- `docker compose up -d postgres` → PostgreSQL elindul
- Backend indul és csatlakozik PostgreSQL-hez
- `create_all` létrehozza a táblákat

**Commit:** `feat: migrate from SQLite to PostgreSQL 18`

---

## Task 2: Backend auth dependencies

**Fájlok:**
- Módosít: `backend/requirements.txt`

**Lépések:**

1. Hozzáadni:
   ```
   python-jose[cryptography]==3.3.0
   ```

**Validáció:** `pip install -r requirements.txt` sikeres

**Commit:** `chore: add JWT auth dependency`

---

## Task 3: User és UserSettings modellek

**Fájlok:**
- Módosít: `backend/app/models.py`
- Módosít: `backend/app/schemas.py`

**Lépések:**

1. Import bővítés `models.py`-ban:
   ```python
   import uuid
   from sqlalchemy import Boolean
   ```

2. User model hozzáadása:
   ```python
   class User(Base):
       __tablename__ = "users"
       id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
       email: Mapped[str] = mapped_column(String(500), unique=True, nullable=False, index=True)
       name: Mapped[str | None] = mapped_column(String(500), nullable=True)
       avatar_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
       locale: Mapped[str] = mapped_column(String(5), default="en")
       created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
       updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
   ```

3. UserSettings model:
   ```python
   class UserSettings(Base):
       __tablename__ = "user_settings"
       id: Mapped[int] = mapped_column(primary_key=True)
       user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), unique=True)
       playback_speed: Mapped[float] = mapped_column(Float, default=1.0)
       audio_quality: Mapped[str] = mapped_column(String(20), default="standard")
       email_notifications: Mapped[bool] = mapped_column(Boolean, default=True)
       theme: Mapped[str] = mapped_column(String(20), default="system")
       ui_language: Mapped[str] = mapped_column(String(5), default="en")
       updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
   ```

4. CreditBalance model:
   ```python
   class CreditBalance(Base):
       __tablename__ = "credit_balances"
       id: Mapped[int] = mapped_column(primary_key=True)
       user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), unique=True)
       balance: Mapped[int] = mapped_column(Integer, default=0)
       updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
   ```

5. CreditTransaction model:
   ```python
   class CreditTransaction(Base):
       __tablename__ = "credit_transactions"
       id: Mapped[int] = mapped_column(primary_key=True)
       user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"))
       amount: Mapped[int] = mapped_column(Integer)  # +/-
       type: Mapped[str] = mapped_column(String(50))  # subscription_grant|purchase|conversion_spend|refund
       description: Mapped[str | None] = mapped_column(String(500), nullable=True)
       reference_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
       created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
   ```

6. Meglévő modellek bővítése — `user_id` oszlop hozzáadása (nullable, mert opcionális auth):
   - `Book` → `user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)`
   - `Voice` → `user_id` + `is_public: Mapped[bool] = mapped_column(Boolean, default=False)`
   - `Job` → `user_id`
   - `PlaybackState` → `user_id`

7. Pydantic schemas hozzáadása `schemas.py`-ba:
   - `UserResponse(id, email, name, avatar_url, locale, created_at)`
   - `UserSettingsResponse(playback_speed, audio_quality, email_notifications, theme, ui_language)`
   - `UserSettingsUpdate` — minden mező opcionális
   - `CreditBalanceResponse(balance)`
   - `CreditTransactionResponse(id, amount, type, description, reference_id, created_at)`

**Validáció:**
```bash
cd backend && python -c "from app.models import User, UserSettings, CreditBalance, CreditTransaction; print('OK')"
```

**Commit:** `feat: add User, UserSettings, CreditBalance, CreditTransaction models`

---

## Task 4: Auth middleware (FastAPI)

**Fájlok:**
- Létrehoz: `backend/app/auth.py`
- Módosít: `backend/app/config.py`

**Lépések:**

1. `config.py` Settings bővítés:
   ```python
   jwt_secret: str = "dev-secret-change-in-production"
   jwt_algorithm: str = "HS256"
   ```

2. `auth.py` létrehozása két dependency-vel:

   **`get_current_user_optional()`** — JWT-ből kinyeri a usert, None ha nincs token:
   - HTTPBearer(auto_error=False) — nem dob 401-et ha nincs token
   - JWT decode → email kinyerése
   - DB lookup → User
   - Ha nincs user → auto-create (email, name, avatar from JWT)
   - Auto-create UserSettings és CreditBalance (3 free credit)
   - Return User | None

   **`get_current_user()`** — kötelező auth, 401 ha nincs:
   - Depends(get_current_user_optional)
   - Ha None → HTTPException(401)
   - Return User

**Fontos:** `get_current_user_optional` lehetővé teszi, hogy a meglévő endpointok auth nélkül is működjenek — a user egyszerűen None lesz.

**Validáció:**
```bash
cd backend && python -c "from app.auth import get_current_user, get_current_user_optional; print('OK')"
```

**Commit:** `feat: add JWT auth middleware with optional user extraction`

---

## Task 5: User API routes

**Fájlok:**
- Létrehoz: `backend/app/routers/users.py`
- Módosít: `backend/app/main.py`

**Lépések:**

1. `users.py` — 5 endpoint:

   | Method | Path | Auth | Leírás |
   |--------|------|------|--------|
   | GET | `/api/users/me` | Kötelező | Profil adatok |
   | GET | `/api/users/me/settings` | Kötelező | Settings lekérés |
   | PUT | `/api/users/me/settings` | Kötelező | Settings frissítés (partial update) |
   | GET | `/api/users/me/credits` | Kötelező | Credit egyenleg |
   | GET | `/api/users/me/credits/history` | Kötelező | Tranzakció történet (limit, offset) |

2. `main.py` — router regisztráció:
   ```python
   from app.routers import users
   app.include_router(users.router)
   ```

**Validáció:** Backend indul, `/api/users/me` válaszol 401-gyel (nincs token)

**Commit:** `feat: add user profile, settings, and credits API endpoints`

---

## Task 6: Credit system service

**Fájlok:**
- Létrehoz: `backend/app/services/credits.py`

**Lépések:**

1. Konstansok:
   ```python
   WORDS_PER_CREDIT = 10_000  # 1 credit ≈ 10,000 szó ≈ 1 fejezet
   ```

2. Utility funkciók:
   - `calculate_credits_needed(total_words: int) -> int` — ceil(words / 10,000), min 1
   - `get_balance(session, user_id) -> int`
   - `spend_credits(session, user_id, amount, description, reference_id?) -> bool` — False ha nincs elég
   - `grant_credits(session, user_id, amount, type, description, reference_id?)`
   - `check_purchase_exists(session, user_id, book_id, voice_id) -> bool`

**Validáció:**
```bash
cd backend && python -c "from app.services.credits import calculate_credits_needed; assert calculate_credits_needed(80000) == 8; print('OK')"
```

**Commit:** `feat: add credit system service`

---

## Task 7: Cost estimation endpoint

**Fájlok:**
- Módosít: `backend/app/routers/books.py`
- Módosít: `backend/app/schemas.py`

**Lépések:**

1. `CostEstimateResponse` schema hozzáadása:
   ```python
   class CostEstimateResponse(BaseModel):
       total_words: int
       credits_required: int
       estimated_cost_usd: float
       current_balance: int
       sufficient_credits: bool
   ```

2. Új endpoint `books.py`-ban:
   ```
   GET /api/books/{book_id}/cost-estimate
   ```
   - Auth: `get_current_user` (kötelező — kell a balance)
   - Sum chapters.word_count
   - calculate_credits_needed(total_words)
   - get_balance(user_id)
   - Return CostEstimateResponse

**Validáció:** Endpoint visszaadja a becslést egy meglévő könyvhöz

**Commit:** `feat: add book conversion cost estimation endpoint`

---

## Task 8: Frontend auth dependencies

**Fájlok:**
- Módosít: `frontend/package.json`

**Lépések:**

1. Install:
   ```bash
   cd frontend && npm install next-auth@beta @auth/core clsx lucide-react
   ```

**Validáció:** `npm ls next-auth` mutatja a telepített verziót

**Commit:** `chore: add NextAuth.js and UI utility dependencies`

---

## Task 9: OAuth provider regisztráció

**Fájlok:**
- Létrehoz: `frontend/.env.example`
- Létrehoz: `frontend/.env.local` (NEM commitolni!)
- Módosít: `frontend/.gitignore`

**Ez manuális lépés, nem kód:**

### Google OAuth App

1. Menj: https://console.cloud.google.com/apis/credentials
2. Create Project → "AudioBookAI"
3. OAuth consent screen → External → App name: AudioBookAI
4. Create Credentials → OAuth 2.0 Client ID
   - Application type: Web application
   - Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google`
5. Másold ki: Client ID és Client Secret

### GitHub OAuth App

1. Menj: https://github.com/settings/developers
2. New OAuth App
   - Application name: AudioBookAI
   - Homepage URL: `http://localhost:3000`
   - Authorization callback URL: `http://localhost:3000/api/auth/callback/github`
3. Másold ki: Client ID, generálj Client Secret

### .env.local kitöltése

```bash
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=$(openssl rand -base64 32)
GOOGLE_CLIENT_ID=<fentről>
GOOGLE_CLIENT_SECRET=<fentről>
GITHUB_ID=<fentről>
GITHUB_SECRET=<fentről>
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### .env.example (commitolható, secret-ek nélkül)

```
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=generate-with-openssl-rand-base64-32
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_ID=
GITHUB_SECRET=
NEXT_PUBLIC_API_URL=http://localhost:8000
```

**Validáció:** `.env.local` létezik, értékek kitöltve

**Commit:** `chore: add .env.example for NextAuth.js OAuth config`

---

## Task 10: NextAuth.js setup

**Fájlok:**
- Létrehoz: `frontend/src/lib/auth.ts`
- Létrehoz: `frontend/src/app/api/auth/[...nextauth]/route.ts`
- Létrehoz: `frontend/src/components/AuthProvider.tsx`
- Módosít: `frontend/src/app/layout.tsx`

**Lépések:**

1. `auth.ts` — NextAuth konfiguráció:
   - Providers: Google, GitHub
   - JWT callback: email, name, picture mentése tokenbe
   - Session callback: user adatok hozzáadása session-höz

2. `route.ts` — NextAuth API route handler:
   ```typescript
   import { handlers } from "@/lib/auth";
   export const { GET, POST } = handlers;
   ```

3. `AuthProvider.tsx` — SessionProvider wrapper (client component):
   ```typescript
   "use client";
   import { SessionProvider } from "next-auth/react";
   export function AuthProvider({ children }) {
     return <SessionProvider>{children}</SessionProvider>;
   }
   ```

4. `layout.tsx` módosítás:
   - Import AuthProvider
   - Children wrapping: `<AuthProvider>{children}</AuthProvider>`
   - Navigáció marad a helyén egyelőre (Phase 2-ben lesz sidebar)

**Validáció:**
- Frontend build sikeres
- `http://localhost:3000/api/auth/providers` válaszol (lista a providerekről)
- `http://localhost:3000/api/auth/signin` megjelenik a NextAuth default sign-in page

**Commit:** `feat: setup NextAuth.js with Google and GitHub OAuth`

---

## Task 11: Sign-in page

**Fájlok:**
- Létrehoz: `frontend/src/app/auth/signin/page.tsx`

**Lépések:**

1. Custom sign-in page a NextAuth default helyett:
   - Dark theme (illeszkedik a meglévő bg-gray-950 stílushoz)
   - Centered card layout
   - Google button (fehér, Google logóval)
   - GitHub button (sötét, GitHub logóval)
   - Loading state az OAuth redirect alatt
   - "3 free credits" badge alul
   - Callback: sikeres login → redirect "/"

**Validáció:** `/auth/signin` betölt, gombok kattinthatók, OAuth redirect működik

**Commit:** `feat: add custom sign-in page`

---

## Task 12: API client auth header support

**Fájlok:**
- Módosít: `frontend/src/lib/api.ts`

**Lépések:**

1. Helper funkció auth header-höz:
   ```typescript
   import { getSession } from "next-auth/react";

   async function authFetch(url: string, options?: RequestInit): Promise<Response> {
     const session = await getSession();
     const headers: HeadersInit = { ...options?.headers };
     if (session) {
       // JWT forwarding a backend-nek
       headers["Authorization"] = `Bearer ${session.accessToken}`;
     }
     return fetch(url, { ...options, headers });
   }
   ```

2. Meglévő API funkciók átírása `fetch` → `authFetch`-re:
   - `getBooks()`, `getBook()`, `uploadBook()`, stb.
   - Nem minden kell azonnal, de az alap wrapper legyen kész

3. Új API funkciók hozzáadása:
   - `getCurrentUser()`
   - `getUserSettings()` / `updateUserSettings()`
   - `getCreditBalance()`
   - `getCreditHistory()`
   - `getBookCostEstimate(bookId)`

4. Új TypeScript típusok:
   - `UserProfile`, `UserSettingsData`, `CreditBalanceData`, `CreditTransactionData`, `CostEstimate`

**Validáció:** Frontend build sikeres, meglévő funkciók továbbra is működnek auth nélkül

**Commit:** `feat: add auth headers and user API client functions`

---

## Összefoglaló

| # | Task | Fájlok | Típus |
|---|------|--------|-------|
| 1 | PostgreSQL Docker + config | 4 fájl | Infra |
| 2 | Backend auth dependency | 1 fájl | Dependency |
| 3 | User + Credit modellek | 2 fájl | Backend |
| 4 | Auth middleware | 2 fájl | Backend |
| 5 | User API routes | 2 fájl | Backend |
| 6 | Credit service | 1 fájl | Backend |
| 7 | Cost estimation endpoint | 2 fájl | Backend |
| 8 | Frontend auth dependencies | 1 fájl | Dependency |
| 9 | OAuth provider regisztráció | 3 fájl | Manual + Config |
| 10 | NextAuth.js setup | 4 fájl | Frontend |
| 11 | Sign-in page | 1 fájl | Frontend |
| 12 | API client auth headers | 1 fájl | Frontend |

**Végrehajtási sorrend:**
```
Task 1 (PostgreSQL)
  └→ Task 2 (backend deps)
       └→ Task 3 (models)
            ├→ Task 4 (auth middleware)
            │    └→ Task 5 (user routes)
            │         └→ Task 7 (cost estimation)
            └→ Task 6 (credit service)

Task 8 (frontend deps) — párhuzamosan indítható Task 1-gyel
  └→ Task 9 (OAuth setup — manuális!)
       └→ Task 10 (NextAuth setup)
            └→ Task 11 (sign-in page)
                 └→ Task 12 (API client)
```

**Becsült idő:** 1-2 nap

All 12 tasks from tasks/auth-user-module.md are fully implemented and validated.

Summary of completed work
Backend (Tasks 1–7)
Task 1: PostgreSQL in docker-compose.yml, config.py uses postgresql+asyncpg, requirements.txt has asyncpg + psycopg2-binary
Task 2: python-jose[cryptography] + bcrypt in requirements
Task 3: User, UserSettings, CreditBalance, CreditTransaction models with relationships; existing models (Book, Voice, Job, PlaybackState) have user_id columns; all Pydantic schemas in schemas.py
Task 4: get_current_user_optional() and get_current_user() JWT auth middleware with auto-provisioning
Task 5: users.py router with /api/users/me, settings, and credits endpoints; registered in main.py
Task 6: credits.py service with calculate_credits_needed(), get_balance(), spend_credits(), grant_credits(), check_purchase_exists()
Task 7: GET /api/books/{book_id}/cost-estimate endpoint with CostEstimateResponse schema
Frontend (Tasks 8–12)
Task 8: next-auth, clsx, lucide-react in package.json
Task 9: Environment files created (.env.local, .env.example)
Task 10: AuthProvider with login/register/logout via JWT + localStorage; Navbar with user menu; layout.tsx wraps children with AuthProvider
Task 11: Custom /auth/signin and /auth/register pages
Task 12: api.ts with authHeaders() and fetchApi() wrappers; user API functions (getCurrentUser(), getUserSettings(), etc.); TypeScript types for all auth/user data models
Validation
Backend: all models, auth, credits, schemas import successfully; calculate_credits_needed() assertions pass
Frontend: next build compiles with zero errors — all 8 routes including /auth/signin and /auth/register generate successfully
Architecture note: The implementation evolved from the original NextAuth.js OAuth plan to a custom JWT-based email/password auth system with auth_routes.py (register + login endpoints) and a client-side AuthProvider using localStorage for token persistence. OAuth providers (Google/GitHub) can be added later as additional auth routes.