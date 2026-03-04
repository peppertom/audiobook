# AudioBookAI SaaS Transformation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the local-first audiobook app into an international SaaS product with user auth, subscription + credit payments, and a polished UI.

**Architecture:** Split deployment (Vercel frontend, Railway backend+DB, RunPod GPU worker, Cloudflare R2 storage). NextAuth.js for auth, Stripe for payments, PostgreSQL replacing SQLite.

**Tech Stack:** Next.js 16 + NextAuth.js v5, FastAPI + SQLAlchemy async, Stripe API, PostgreSQL, Cloudflare R2, Tailwind CSS 4.

**Design Doc:** `docs/plans/2026-03-04-saas-transformation-design.md`

---

## Phase 1: Auth & User Model

### Task 1: Add backend dependencies for auth & PostgreSQL

**Files:**
- Modify: `backend/requirements.txt`

**Step 1: Add new dependencies**

Add these lines to `backend/requirements.txt`:

```
# Auth
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4

# PostgreSQL (production)
asyncpg==0.30.0
psycopg2-binary==2.9.9

# S3/R2 (for later phases, install now)
boto3==1.35.0

# Email (for later phases)
resend==2.5.0
```

**Step 2: Install dependencies**

Run: `cd backend && pip install -r requirements.txt`
Expected: All packages install successfully.

**Step 3: Commit**

```bash
git add backend/requirements.txt
git commit -m "chore: add auth, PostgreSQL, and S3 dependencies"
```

---

### Task 2: Add frontend dependencies for auth & UI

**Files:**
- Modify: `frontend/package.json`

**Step 1: Install NextAuth.js and UI dependencies**

Run:
```bash
cd frontend && npm install next-auth@beta @auth/core stripe @stripe/stripe-js lucide-react clsx
```

This installs:
- `next-auth@beta` — NextAuth.js v5 (compatible with Next.js 16 App Router)
- `@auth/core` — Core auth utilities
- `stripe` — Stripe Node.js SDK (server-side)
- `@stripe/stripe-js` — Stripe.js (client-side)
- `lucide-react` — Icon library (replacing emoji icons)
- `clsx` — Conditional classnames utility

**Step 2: Commit**

```bash
cd frontend && git add package.json package-lock.json
git commit -m "chore: add NextAuth.js, Stripe, and UI dependencies"
```

---

### Task 3: Create User and UserSettings SQLAlchemy models

**Files:**
- Modify: `backend/app/models.py`
- Modify: `backend/app/schemas.py`

**Step 1: Add User and UserSettings models to `backend/app/models.py`**

Add these imports at the top (alongside existing ones):

```python
import uuid
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy import Boolean
```

Add after the existing PlaybackState model:

```python
class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(500), unique=True, nullable=False, index=True)
    name = Column(String(500), nullable=True)
    avatar_url = Column(String(1000), nullable=True)
    locale = Column(String(5), default="en")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    settings = relationship("UserSettings", back_populates="user", uselist=False, cascade="all, delete-orphan")
    subscription = relationship("Subscription", back_populates="user", uselist=False, cascade="all, delete-orphan")
    credit_balance = relationship("CreditBalance", back_populates="user", uselist=False, cascade="all, delete-orphan")
    books = relationship("Book", back_populates="owner")
    voices = relationship("Voice", back_populates="owner")


class UserSettings(Base):
    __tablename__ = "user_settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(36), ForeignKey("users.id"), unique=True, nullable=False)
    playback_speed = Column(Float, default=1.0)
    audio_quality = Column(String(20), default="standard")  # standard | high
    email_notifications = Column(Boolean, default=True)
    theme = Column(String(20), default="system")  # light | dark | system
    ui_language = Column(String(5), default="en")
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="settings")


class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(36), ForeignKey("users.id"), unique=True, nullable=False)
    stripe_customer_id = Column(String(200), unique=True, nullable=True)
    stripe_subscription_id = Column(String(200), unique=True, nullable=True)
    plan = Column(String(20), default="free")  # free | starter | pro
    status = Column(String(20), default="active")  # active | canceled | past_due
    current_period_start = Column(DateTime, nullable=True)
    current_period_end = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="subscription")


class CreditBalance(Base):
    __tablename__ = "credit_balances"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(36), ForeignKey("users.id"), unique=True, nullable=False)
    balance = Column(Integer, default=0)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="credit_balance")


class CreditTransaction(Base):
    __tablename__ = "credit_transactions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    amount = Column(Integer, nullable=False)  # positive = add, negative = spend
    type = Column(String(50), nullable=False)  # subscription_grant | purchase | conversion_spend | refund
    description = Column(String(500), nullable=True)
    reference_id = Column(String(200), nullable=True)  # stripe payment ID or job ID
    created_at = Column(DateTime, server_default=func.now())


class Purchase(Base):
    __tablename__ = "purchases"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    book_id = Column(Integer, ForeignKey("books.id"), nullable=False)
    voice_id = Column(Integer, ForeignKey("voices.id"), nullable=False)
    credits_spent = Column(Integer, nullable=False)
    status = Column(String(20), default="pending")  # pending | completed | failed
    created_at = Column(DateTime, server_default=func.now())
```

**Step 2: Add `user_id` to existing models**

Modify the existing `Book` model — add after `chapter_count`:

```python
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True)  # nullable for migration
    owner = relationship("User", back_populates="books")
```

Modify the existing `Voice` model — add after `source`:

```python
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    is_public = Column(Boolean, default=False)
    owner = relationship("User", back_populates="voices")
```

Modify the existing `Job` model — add after `error_message`:

```python
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True)
```

Modify the existing `PlaybackState` model — add:

```python
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True)
```

**Step 3: Add Pydantic schemas to `backend/app/schemas.py`**

Add these schemas:

```python
class UserBase(BaseModel):
    email: str
    name: str | None = None
    avatar_url: str | None = None
    locale: str = "en"

class UserCreate(UserBase):
    pass

class UserResponse(UserBase):
    id: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class UserSettingsResponse(BaseModel):
    playback_speed: float = 1.0
    audio_quality: str = "standard"
    email_notifications: bool = True
    theme: str = "system"
    ui_language: str = "en"
    model_config = ConfigDict(from_attributes=True)

class UserSettingsUpdate(BaseModel):
    playback_speed: float | None = None
    audio_quality: str | None = None
    email_notifications: bool | None = None
    theme: str | None = None
    ui_language: str | None = None

class CreditBalanceResponse(BaseModel):
    balance: int
    model_config = ConfigDict(from_attributes=True)

class CreditTransactionResponse(BaseModel):
    id: int
    amount: int
    type: str
    description: str | None
    reference_id: str | None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class SubscriptionResponse(BaseModel):
    plan: str
    status: str
    current_period_start: datetime | None
    current_period_end: datetime | None
    model_config = ConfigDict(from_attributes=True)

class CostEstimateResponse(BaseModel):
    total_words: int
    credits_required: int
    estimated_cost_usd: float
    current_balance: int
    sufficient_credits: bool

class PurchaseResponse(BaseModel):
    id: int
    book_id: int
    voice_id: int
    credits_spent: int
    status: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
```

**Step 4: Verify models compile**

Run: `cd backend && python -c "from app.models import User, UserSettings, Subscription, CreditBalance, CreditTransaction, Purchase; print('Models OK')"`
Expected: `Models OK`

**Step 5: Commit**

```bash
git add backend/app/models.py backend/app/schemas.py
git commit -m "feat: add User, Subscription, Credit, and Purchase models"
```

---

### Task 4: Create auth middleware for FastAPI

**Files:**
- Create: `backend/app/auth.py`
- Modify: `backend/app/config.py`

**Step 1: Add auth config to `backend/app/config.py`**

Add these fields to the existing `Settings` class:

```python
    # Auth
    jwt_secret: str = "dev-secret-change-in-production"
    jwt_algorithm: str = "HS256"
    nextauth_url: str = "http://localhost:3000"
```

**Step 2: Create `backend/app/auth.py`**

```python
"""JWT auth middleware for FastAPI. Validates NextAuth.js JWT tokens."""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.database import get_session
from app.models import User, UserSettings, CreditBalance

security = HTTPBearer(auto_error=False)


async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    session: AsyncSession = Depends(get_session),
) -> User | None:
    """Extract user from JWT if present. Returns None if no auth."""
    if not credentials:
        return None

    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
        user_email = payload.get("email")
        if not user_email:
            return None
    except JWTError:
        return None

    result = await session.execute(select(User).where(User.email == user_email))
    user = result.scalar_one_or_none()

    if not user:
        # Auto-create user on first API call (synced from NextAuth)
        user = User(
            email=user_email,
            name=payload.get("name"),
            avatar_url=payload.get("picture"),
        )
        session.add(user)
        # Create default settings and credit balance
        session.add(UserSettings(user_id=user.id))
        session.add(CreditBalance(user_id=user.id, balance=3))  # 3 free credits
        await session.commit()
        await session.refresh(user)

    return user


async def get_current_user(
    user: User | None = Depends(get_current_user_optional),
) -> User:
    """Require authenticated user. Raises 401 if not authenticated."""
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user
```

**Step 3: Verify the auth module loads**

Run: `cd backend && python -c "from app.auth import get_current_user, get_current_user_optional; print('Auth OK')"`
Expected: `Auth OK`

**Step 4: Commit**

```bash
git add backend/app/auth.py backend/app/config.py
git commit -m "feat: add JWT auth middleware with auto-provisioning"
```

---

### Task 5: Create user routes (profile, settings)

**Files:**
- Create: `backend/app/routers/users.py`
- Modify: `backend/app/main.py`

**Step 1: Create `backend/app/routers/users.py`**

```python
"""User profile and settings endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.auth import get_current_user
from app.database import get_session
from app.models import User, UserSettings, CreditBalance, CreditTransaction, Subscription
from app.schemas import (
    UserResponse,
    UserSettingsResponse,
    UserSettingsUpdate,
    CreditBalanceResponse,
    CreditTransactionResponse,
    SubscriptionResponse,
)

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(user: User = Depends(get_current_user)):
    """Get the current user's profile."""
    return user


@router.get("/me/settings", response_model=UserSettingsResponse)
async def get_user_settings(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get the current user's settings."""
    result = await session.execute(
        select(UserSettings).where(UserSettings.user_id == user.id)
    )
    settings = result.scalar_one_or_none()
    if not settings:
        settings = UserSettings(user_id=user.id)
        session.add(settings)
        await session.commit()
        await session.refresh(settings)
    return settings


@router.put("/me/settings", response_model=UserSettingsResponse)
async def update_user_settings(
    update: UserSettingsUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Update the current user's settings."""
    result = await session.execute(
        select(UserSettings).where(UserSettings.user_id == user.id)
    )
    settings = result.scalar_one_or_none()
    if not settings:
        settings = UserSettings(user_id=user.id)
        session.add(settings)

    for field, value in update.model_dump(exclude_unset=True).items():
        setattr(settings, field, value)

    await session.commit()
    await session.refresh(settings)
    return settings


@router.get("/me/credits", response_model=CreditBalanceResponse)
async def get_credit_balance(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get the current user's credit balance."""
    result = await session.execute(
        select(CreditBalance).where(CreditBalance.user_id == user.id)
    )
    balance = result.scalar_one_or_none()
    if not balance:
        balance = CreditBalance(user_id=user.id, balance=0)
        session.add(balance)
        await session.commit()
        await session.refresh(balance)
    return balance


@router.get("/me/credits/history", response_model=list[CreditTransactionResponse])
async def get_credit_history(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    limit: int = 50,
    offset: int = 0,
):
    """Get the current user's credit transaction history."""
    result = await session.execute(
        select(CreditTransaction)
        .where(CreditTransaction.user_id == user.id)
        .order_by(CreditTransaction.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return result.scalars().all()


@router.get("/me/subscription", response_model=SubscriptionResponse | None)
async def get_subscription(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get the current user's subscription info."""
    result = await session.execute(
        select(Subscription).where(Subscription.user_id == user.id)
    )
    return result.scalar_one_or_none()
```

**Step 2: Register the router in `backend/app/main.py`**

Add this import:

```python
from app.routers import users
```

Add this line after existing `app.include_router(...)` calls:

```python
app.include_router(users.router)
```

**Step 3: Verify the server starts**

Run: `cd backend && python -c "from app.main import app; print('Routes:', [r.path for r in app.routes if hasattr(r, 'path')])" | head -5`
Expected: Should list routes including `/api/users/me`

**Step 4: Commit**

```bash
git add backend/app/routers/users.py backend/app/main.py
git commit -m "feat: add user profile, settings, and credits API endpoints"
```

---

### Task 6: Create credit system service

**Files:**
- Create: `backend/app/services/credits.py`

**Step 1: Create `backend/app/services/credits.py`**

```python
"""Credit system service — handles balance checks, spending, and granting."""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.models import CreditBalance, CreditTransaction, Purchase

# Credit calculation: 1 credit ≈ 10,000 words
WORDS_PER_CREDIT = 10_000

# Plan monthly credit grants (placeholder — finalize later)
PLAN_CREDITS = {
    "free": 3,
    "starter": 30,
    "pro": 100,
}

# Approximate USD per credit by plan (placeholder)
CREDIT_COST_USD = {
    "free": 0.00,
    "starter": 0.30,  # $9 / 30 credits
    "pro": 0.29,  # $29 / 100 credits
}


def calculate_credits_needed(total_words: int) -> int:
    """Calculate credits needed for a book based on word count."""
    return max(1, (total_words + WORDS_PER_CREDIT - 1) // WORDS_PER_CREDIT)


async def get_balance(session: AsyncSession, user_id: str) -> int:
    """Get user's current credit balance."""
    result = await session.execute(
        select(CreditBalance.balance).where(CreditBalance.user_id == user_id)
    )
    balance = result.scalar_one_or_none()
    return balance if balance is not None else 0


async def spend_credits(
    session: AsyncSession,
    user_id: str,
    amount: int,
    description: str,
    reference_id: str | None = None,
) -> bool:
    """Spend credits. Returns True if successful, False if insufficient balance."""
    current = await get_balance(session, user_id)
    if current < amount:
        return False

    # Deduct balance
    await session.execute(
        update(CreditBalance)
        .where(CreditBalance.user_id == user_id)
        .values(balance=CreditBalance.balance - amount)
    )

    # Record transaction
    session.add(
        CreditTransaction(
            user_id=user_id,
            amount=-amount,
            type="conversion_spend",
            description=description,
            reference_id=reference_id,
        )
    )

    await session.flush()
    return True


async def grant_credits(
    session: AsyncSession,
    user_id: str,
    amount: int,
    type: str,
    description: str,
    reference_id: str | None = None,
) -> None:
    """Grant credits to user (subscription renewal, purchase, refund)."""
    # Ensure balance record exists
    result = await session.execute(
        select(CreditBalance).where(CreditBalance.user_id == user_id)
    )
    balance = result.scalar_one_or_none()
    if not balance:
        balance = CreditBalance(user_id=user_id, balance=0)
        session.add(balance)
        await session.flush()

    # Add balance
    await session.execute(
        update(CreditBalance)
        .where(CreditBalance.user_id == user_id)
        .values(balance=CreditBalance.balance + amount)
    )

    # Record transaction
    session.add(
        CreditTransaction(
            user_id=user_id,
            amount=amount,
            type=type,
            description=description,
            reference_id=reference_id,
        )
    )

    await session.flush()


async def check_purchase_exists(
    session: AsyncSession, user_id: str, book_id: int, voice_id: int
) -> bool:
    """Check if user has already purchased this book+voice combo."""
    result = await session.execute(
        select(Purchase).where(
            Purchase.user_id == user_id,
            Purchase.book_id == book_id,
            Purchase.voice_id == voice_id,
            Purchase.status == "completed",
        )
    )
    return result.scalar_one_or_none() is not None
```

**Step 2: Verify it imports**

Run: `cd backend && python -c "from app.services.credits import calculate_credits_needed; print(calculate_credits_needed(80000))"`
Expected: `8`

**Step 3: Commit**

```bash
git add backend/app/services/credits.py
git commit -m "feat: add credit system service with balance management"
```

---

### Task 7: Add cost estimation endpoint

**Files:**
- Modify: `backend/app/routers/books.py`

**Step 1: Add cost estimation endpoint to `backend/app/routers/books.py`**

Add imports:

```python
from app.auth import get_current_user
from app.models import User
from app.schemas import CostEstimateResponse
from app.services.credits import calculate_credits_needed, get_balance, CREDIT_COST_USD
```

Add this endpoint after the existing routes:

```python
@router.get("/{book_id}/cost-estimate", response_model=CostEstimateResponse)
async def estimate_conversion_cost(
    book_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Estimate the credit cost to convert a book to audiobook."""
    result = await session.execute(select(Book).where(Book.id == book_id))
    book = result.scalar_one_or_none()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    # Sum word counts across all chapters
    chapter_result = await session.execute(
        select(func.sum(Chapter.word_count)).where(Chapter.book_id == book_id)
    )
    total_words = chapter_result.scalar() or 0

    credits_needed = calculate_credits_needed(total_words)
    current_balance = await get_balance(session, user.id)

    # Estimate USD cost based on user's plan
    from app.models import Subscription
    sub_result = await session.execute(
        select(Subscription.plan).where(Subscription.user_id == user.id)
    )
    plan = sub_result.scalar() or "free"
    cost_per_credit = CREDIT_COST_USD.get(plan, 0.30)

    return CostEstimateResponse(
        total_words=total_words,
        credits_required=credits_needed,
        estimated_cost_usd=round(credits_needed * cost_per_credit, 2),
        current_balance=current_balance,
        sufficient_credits=current_balance >= credits_needed,
    )
```

Also add `func` import if not present:

```python
from sqlalchemy import select, func
```

And import Chapter:

```python
from app.models import Book, Chapter
```

**Step 2: Commit**

```bash
git add backend/app/routers/books.py
git commit -m "feat: add book cost estimation endpoint"
```

---

### Task 8: Setup NextAuth.js in frontend

**Files:**
- Create: `frontend/src/app/api/auth/[...nextauth]/route.ts`
- Create: `frontend/src/lib/auth.ts`
- Create: `frontend/.env.local` (template — don't commit secrets)
- Create: `frontend/.env.example`

**Step 1: Create `.env.example`**

Create `frontend/.env.example`:

```
# NextAuth.js
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=generate-with-openssl-rand-base64-32

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# GitHub OAuth
GITHUB_ID=
GITHUB_SECRET=

# Backend
NEXT_PUBLIC_API_URL=http://localhost:8000

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

**Step 2: Create `frontend/src/lib/auth.ts`**

```typescript
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    GitHub({
      clientId: process.env.GITHUB_ID!,
      clientSecret: process.env.GITHUB_SECRET!,
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.email = user.email;
        token.name = user.name;
        token.picture = user.image;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        session.user.image = token.picture as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
};

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig);
```

**Step 3: Create `frontend/src/app/api/auth/[...nextauth]/route.ts`**

```typescript
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
```

**Step 4: Create auth context provider**

Create `frontend/src/components/AuthProvider.tsx`:

```typescript
"use client";

import { SessionProvider } from "next-auth/react";
import { ReactNode } from "react";

export function AuthProvider({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
```

**Step 5: Add AuthProvider to layout**

Modify `frontend/src/app/layout.tsx` — wrap children with AuthProvider:

```typescript
import { AuthProvider } from "@/components/AuthProvider";
```

In the body, wrap `{children}` with `<AuthProvider>{children}</AuthProvider>`.

**Step 6: Commit**

```bash
git add frontend/src/lib/auth.ts frontend/src/app/api/auth/ frontend/src/components/AuthProvider.tsx frontend/.env.example frontend/src/app/layout.tsx
git commit -m "feat: setup NextAuth.js with Google and GitHub providers"
```

---

### Task 9: Create sign-in page

**Files:**
- Create: `frontend/src/app/auth/signin/page.tsx`

**Step 1: Create the sign-in page**

Create `frontend/src/app/auth/signin/page.tsx`:

```typescript
"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export default function SignInPage() {
  const [isLoading, setIsLoading] = useState<string | null>(null);

  const handleSignIn = async (provider: string) => {
    setIsLoading(provider);
    await signIn(provider, { callbackUrl: "/" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="w-full max-w-md mx-4">
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl p-8 border border-slate-700/50 shadow-2xl">
          {/* Logo and Title */}
          <div className="text-center mb-8">
            <div className="text-4xl mb-3">🎧</div>
            <h1 className="text-2xl font-bold text-white mb-2">AudioBookAI</h1>
            <p className="text-slate-400 text-sm">
              Transform your EPUB books into audiobooks with AI voice cloning
            </p>
          </div>

          {/* Sign-in buttons */}
          <div className="space-y-3">
            <button
              onClick={() => handleSignIn("google")}
              disabled={isLoading !== null}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 text-gray-800 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading === "google" ? (
                <span className="animate-spin">⏳</span>
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              )}
              Continue with Google
            </button>

            <button
              onClick={() => handleSignIn("github")}
              disabled={isLoading !== null}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading === "github" ? (
                <span className="animate-spin">⏳</span>
              ) : (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
                </svg>
              )}
              Continue with GitHub
            </button>
          </div>

          {/* Footer */}
          <div className="mt-8 text-center">
            <p className="text-slate-500 text-xs">
              By signing in, you agree to our Terms of Service and Privacy Policy
            </p>
          </div>
        </div>

        {/* Free trial badge */}
        <div className="text-center mt-6">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 text-emerald-400 text-sm rounded-full border border-emerald-500/20">
            ✨ 3 free credits to start — no credit card required
          </span>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/app/auth/signin/page.tsx
git commit -m "feat: add sign-in page with Google and GitHub buttons"
```

---

### Task 10: Update API client with auth headers

**Files:**
- Modify: `frontend/src/lib/api.ts`

**Step 1: Add auth token handling to API client**

At the top of `frontend/src/lib/api.ts`, add a function to get the session token and pass it with every API request:

```typescript
import { getSession } from "next-auth/react";

async function getAuthHeaders(): Promise<HeadersInit> {
  const session = await getSession();
  if (session) {
    // NextAuth.js includes the JWT in the session — we forward it to FastAPI
    return {
      Authorization: `Bearer ${(session as any).accessToken || ""}`,
    };
  }
  return {};
}
```

Modify the existing fetch wrapper (or add one if it doesn't exist) to include auth headers in all API calls. Each existing API function that calls `fetch(API_BASE + ...)` should include the auth headers:

```typescript
const headers = await getAuthHeaders();
// Include in fetch options: { headers: { ...headers, ...otherHeaders } }
```

Also add new API functions:

```typescript
// User API
export async function getCurrentUser() {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/api/users/me`, { headers });
  if (!res.ok) return null;
  return res.json();
}

export async function getUserSettings() {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/api/users/me/settings`, { headers });
  if (!res.ok) return null;
  return res.json();
}

export async function updateUserSettings(settings: Record<string, any>) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/api/users/me/settings`, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  return res.json();
}

export async function getCreditBalance() {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/api/users/me/credits`, { headers });
  if (!res.ok) return { balance: 0 };
  return res.json();
}

export async function getCreditHistory(limit = 50) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/api/users/me/credits/history?limit=${limit}`, { headers });
  if (!res.ok) return [];
  return res.json();
}

export async function getBookCostEstimate(bookId: number) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/api/books/${bookId}/cost-estimate`, { headers });
  if (!res.ok) throw new Error("Failed to get cost estimate");
  return res.json();
}

// Types
export interface CostEstimate {
  total_words: number;
  credits_required: number;
  estimated_cost_usd: number;
  current_balance: number;
  sufficient_credits: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  locale: string;
  created_at: string;
}

export interface UserSettingsData {
  playback_speed: number;
  audio_quality: string;
  email_notifications: boolean;
  theme: string;
  ui_language: string;
}

export interface CreditBalanceData {
  balance: number;
}

export interface CreditTransactionData {
  id: number;
  amount: number;
  type: string;
  description: string | null;
  reference_id: string | null;
  created_at: string;
}
```

**Step 2: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: add auth headers and user/credit API client functions"
```

---

## Phase 2: UI Overhaul

### Task 11: Create sidebar layout shell

**Files:**
- Create: `frontend/src/components/Sidebar.tsx`
- Create: `frontend/src/components/TopBar.tsx`
- Modify: `frontend/src/app/layout.tsx`

**Step 1: Create `frontend/src/components/Sidebar.tsx`**

```typescript
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import clsx from "clsx";

const navItems = [
  { href: "/", label: "Library", icon: "📚" },
  { href: "/voices", label: "Voices", icon: "🎙️" },
  { href: "/queue", label: "Queue", icon: "📊" },
];

const secondaryItems = [
  { href: "/profile", label: "Profile", icon: "👤" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  if (!session) return null;

  return (
    <aside className="hidden md:flex md:flex-col md:w-60 bg-slate-900 border-r border-slate-700/50 h-screen sticky top-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-700/50">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl">🎧</span>
          <span className="text-lg font-bold text-white">AudioBookAI</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              pathname === item.href
                ? "bg-slate-700/50 text-white"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            )}
          >
            <span>{item.icon}</span>
            {item.label}
          </Link>
        ))}

        <div className="my-4 border-t border-slate-700/50" />

        {secondaryItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              pathname === item.href
                ? "bg-slate-700/50 text-white"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            )}
          >
            <span>{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Upgrade CTA */}
      <div className="px-3 pb-4">
        <Link
          href="/pricing"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-300 hover:from-amber-500/30 hover:to-orange-500/30 border border-amber-500/20 transition-colors"
        >
          <span>💎</span>
          Upgrade Plan
        </Link>
      </div>
    </aside>
  );
}
```

**Step 2: Create `frontend/src/components/TopBar.tsx`**

```typescript
"use client";

import { useSession, signOut } from "next-auth/react";
import { useState, useEffect } from "react";
import { getCreditBalance } from "@/lib/api";
import Link from "next/link";

export function TopBar() {
  const { data: session } = useSession();
  const [credits, setCredits] = useState<number | null>(null);
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    if (session) {
      getCreditBalance().then((data) => setCredits(data.balance));
    }
  }, [session]);

  if (!session) return null;

  return (
    <header className="h-14 border-b border-slate-700/50 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-40 flex items-center justify-end px-6 gap-4">
      {/* Credits badge */}
      <Link
        href="/profile"
        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 rounded-full text-sm text-slate-300 hover:text-white transition-colors"
      >
        <span>💎</span>
        <span>{credits !== null ? credits : "..."} credits</span>
      </Link>

      {/* User avatar dropdown */}
      <div className="relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="w-8 h-8 rounded-full bg-slate-700 overflow-hidden hover:ring-2 ring-slate-500 transition-all"
        >
          {session.user?.image ? (
            <img
              src={session.user.image}
              alt={session.user.name || ""}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-sm text-slate-300">
              {session.user?.name?.charAt(0) || "?"}
            </span>
          )}
        </button>

        {showMenu && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowMenu(false)}
            />
            <div className="absolute right-0 top-10 z-50 w-48 bg-slate-800 rounded-lg border border-slate-700 shadow-xl py-1">
              <div className="px-3 py-2 border-b border-slate-700">
                <p className="text-sm font-medium text-white truncate">
                  {session.user?.name}
                </p>
                <p className="text-xs text-slate-400 truncate">
                  {session.user?.email}
                </p>
              </div>
              <Link
                href="/profile"
                onClick={() => setShowMenu(false)}
                className="block px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white"
              >
                Profile
              </Link>
              <Link
                href="/settings"
                onClick={() => setShowMenu(false)}
                className="block px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white"
              >
                Settings
              </Link>
              <button
                onClick={() => signOut({ callbackUrl: "/auth/signin" })}
                className="block w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-slate-700"
              >
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
```

**Step 3: Update `frontend/src/app/layout.tsx`**

Replace the layout to use sidebar + topbar pattern:

```typescript
import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";

export const metadata: Metadata = {
  title: "AudioBookAI",
  description: "Transform EPUB books into audiobooks with AI voice cloning",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-white antialiased">
        <AuthProvider>
          <div className="flex min-h-screen">
            <Sidebar />
            <div className="flex-1 flex flex-col min-h-screen">
              <TopBar />
              <main className="flex-1 p-6">{children}</main>
            </div>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
```

**Step 4: Commit**

```bash
git add frontend/src/components/Sidebar.tsx frontend/src/components/TopBar.tsx frontend/src/app/layout.tsx
git commit -m "feat: add sidebar navigation, top bar with credits, and layout shell"
```

---

### Task 12: Create Profile page

**Files:**
- Create: `frontend/src/app/profile/page.tsx`

**Step 1: Create profile page**

Create `frontend/src/app/profile/page.tsx`:

```typescript
"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import {
  getCreditBalance,
  getCreditHistory,
  CreditBalanceData,
  CreditTransactionData,
} from "@/lib/api";

export default function ProfilePage() {
  const { data: session } = useSession();
  const [credits, setCredits] = useState<CreditBalanceData | null>(null);
  const [history, setHistory] = useState<CreditTransactionData[]>([]);

  useEffect(() => {
    getCreditBalance().then(setCredits);
    getCreditHistory(20).then(setHistory);
  }, []);

  if (!session) return null;

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold">Profile</h1>

      {/* User info card */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
        <div className="flex items-center gap-4">
          {session.user?.image ? (
            <img
              src={session.user.image}
              alt=""
              className="w-16 h-16 rounded-full"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-slate-700 flex items-center justify-center text-2xl">
              {session.user?.name?.charAt(0) || "?"}
            </div>
          )}
          <div>
            <h2 className="text-xl font-semibold">{session.user?.name}</h2>
            <p className="text-slate-400">{session.user?.email}</p>
          </div>
        </div>
      </div>

      {/* Credits card */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
        <h3 className="text-lg font-semibold mb-4">Credits</h3>
        <div className="flex items-baseline gap-2 mb-6">
          <span className="text-4xl font-bold text-amber-400">
            {credits?.balance ?? "..."}
          </span>
          <span className="text-slate-400">credits available</span>
        </div>

        {/* Transaction history */}
        <h4 className="text-sm font-medium text-slate-400 mb-3 uppercase tracking-wide">
          Recent Activity
        </h4>
        {history.length === 0 ? (
          <p className="text-slate-500 text-sm">No transactions yet</p>
        ) : (
          <div className="space-y-2">
            {history.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between py-2 border-b border-slate-700/50 last:border-0"
              >
                <div>
                  <p className="text-sm">{tx.description || tx.type}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(tx.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span
                  className={
                    tx.amount > 0 ? "text-emerald-400" : "text-red-400"
                  }
                >
                  {tx.amount > 0 ? "+" : ""}
                  {tx.amount}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/app/profile/page.tsx
git commit -m "feat: add profile page with credits balance and history"
```

---

### Task 13: Create Settings page

**Files:**
- Create: `frontend/src/app/settings/page.tsx`

**Step 1: Create settings page**

Create `frontend/src/app/settings/page.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import { getUserSettings, updateUserSettings, UserSettingsData } from "@/lib/api";

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettingsData | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getUserSettings().then(setSettings);
  }, []);

  const handleChange = async (key: string, value: any) => {
    if (!settings) return;
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    setSaving(true);
    setSaved(false);
    await updateUserSettings({ [key]: value });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!settings) {
    return <div className="text-slate-400">Loading settings...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Settings</h1>
        {saving && <span className="text-sm text-slate-400">Saving...</span>}
        {saved && <span className="text-sm text-emerald-400">✓ Saved</span>}
      </div>

      {/* Playback */}
      <section className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50 space-y-4">
        <h2 className="text-lg font-semibold">Playback</h2>
        <div>
          <label className="block text-sm text-slate-400 mb-2">
            Default Speed: {settings.playback_speed}x
          </label>
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.25"
            value={settings.playback_speed}
            onChange={(e) =>
              handleChange("playback_speed", parseFloat(e.target.value))
            }
            className="w-full accent-amber-500"
          />
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>0.5x</span>
            <span>1x</span>
            <span>1.5x</span>
            <span>2x</span>
          </div>
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-2">
            Audio Quality
          </label>
          <select
            value={settings.audio_quality}
            onChange={(e) => handleChange("audio_quality", e.target.value)}
            className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm w-full"
          >
            <option value="standard">Standard</option>
            <option value="high">High Quality</option>
          </select>
        </div>
      </section>

      {/* Appearance */}
      <section className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50 space-y-4">
        <h2 className="text-lg font-semibold">Appearance</h2>

        <div>
          <label className="block text-sm text-slate-400 mb-2">Theme</label>
          <div className="flex gap-2">
            {["light", "dark", "system"].map((t) => (
              <button
                key={t}
                onClick={() => handleChange("theme", t)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  settings.theme === t
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    : "bg-slate-700 text-slate-400 hover:text-white"
                }`}
              >
                {t === "light" ? "☀️" : t === "dark" ? "🌙" : "💻"}{" "}
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-2">Language</label>
          <select
            value={settings.ui_language}
            onChange={(e) => handleChange("ui_language", e.target.value)}
            className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm w-full"
          >
            <option value="en">English</option>
            <option value="hu">Magyar</option>
          </select>
        </div>
      </section>

      {/* Notifications */}
      <section className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50 space-y-4">
        <h2 className="text-lg font-semibold">Notifications</h2>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.email_notifications}
            onChange={(e) =>
              handleChange("email_notifications", e.target.checked)
            }
            className="w-4 h-4 accent-amber-500"
          />
          <span className="text-sm">
            Email me when audiobook conversion is complete
          </span>
        </label>
      </section>

      {/* Danger Zone */}
      <section className="bg-red-900/10 rounded-xl p-6 border border-red-800/30 space-y-4">
        <h2 className="text-lg font-semibold text-red-400">Danger Zone</h2>
        <p className="text-sm text-slate-400">
          Deleting your account will remove all your data after a 30-day grace
          period.
        </p>
        <button className="px-4 py-2 bg-red-600/20 text-red-400 rounded-lg text-sm hover:bg-red-600/30 border border-red-600/30">
          Delete Account
        </button>
      </section>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/app/settings/page.tsx
git commit -m "feat: add settings page with playback, appearance, and notification controls"
```

---

### Task 14: Enhance Library page with search, filter, sort

**Files:**
- Modify: `frontend/src/app/page.tsx`
- Modify: `frontend/src/components/BookCard.tsx`

**Step 1: Enhance the Library page**

Rewrite `frontend/src/app/page.tsx` with search bar, filter dropdowns, sort controls, and view mode toggle. Keep existing upload functionality, add pagination (20 books per page).

Key additions:
- Search input at the top (filters client-side by title/author)
- Status filter dropdown: All / Not started / In progress / Completed / Converting
- Sort select: Recently added / Title A-Z / Author A-Z / Last played
- View mode toggle: Grid / List
- Responsive grid with improved spacing

**Step 2: Enhance BookCard**

Update `frontend/src/components/BookCard.tsx` to show:
- Progress bar (chapters completed / total)
- Voice name (if conversion started)
- Estimated listening time
- Status badge
- Hover state with subtle scale

**Step 3: Commit**

```bash
git add frontend/src/app/page.tsx frontend/src/components/BookCard.tsx
git commit -m "feat: enhance library with search, filter, sort, and improved cards"
```

---

### Task 15: Add cost estimation to Book Detail page

**Files:**
- Modify: `frontend/src/app/books/[id]/page.tsx`

**Step 1: Add cost estimation component**

Before the "Generate Audiobook" button, add a cost estimation card:
- Fetch cost estimate from `/api/books/{id}/cost-estimate`
- Show total words, credits required, estimated USD cost
- Show current credit balance
- Disable convert button if insufficient credits
- Add "Buy more credits" link if insufficient

**Step 2: Add download buttons for purchased content**

For chapters with completed audio:
- Add download button (links to signed URL)
- Add "Download Full Book" button at the top (concatenated MP3)

**Step 3: Commit**

```bash
git add frontend/src/app/books/\\[id\\]/page.tsx
git commit -m "feat: add cost estimation and download buttons to book detail"
```

---

### Task 16: Create persistent Player Bar component

**Files:**
- Create: `frontend/src/components/PlayerBar.tsx`
- Create: `frontend/src/context/PlayerContext.tsx`
- Modify: `frontend/src/app/layout.tsx`

**Step 1: Create PlayerContext for global state**

Create `frontend/src/context/PlayerContext.tsx` with:
- Current track (chapter audio URL, title, book title, voice name)
- Playback state (playing, paused, position, duration)
- Chapter navigation (next/prev)
- Speed control
- Volume control
- Methods: play, pause, seek, nextChapter, prevChapter, setSpeed

**Step 2: Create PlayerBar component**

Create `frontend/src/components/PlayerBar.tsx`:
- Fixed to bottom of screen
- Shows current chapter info
- Play/pause, skip 15s, next/prev chapter buttons
- Progress bar with seek
- Speed dropdown (0.5x - 2x)
- Volume slider
- Only visible when a track is loaded

**Step 3: Add PlayerBar and PlayerContext to layout**

Wrap the layout with PlayerProvider, add PlayerBar before closing body.

**Step 4: Commit**

```bash
git add frontend/src/components/PlayerBar.tsx frontend/src/context/PlayerContext.tsx frontend/src/app/layout.tsx
git commit -m "feat: add persistent player bar with global playback context"
```

---

## Phase 3: Stripe Integration

### Task 17: Create Stripe webhook handler (backend)

**Files:**
- Create: `backend/app/routers/stripe_webhooks.py`
- Modify: `backend/app/config.py`
- Modify: `backend/app/main.py`

**Step 1: Add Stripe config**

Add to `backend/app/config.py` Settings class:

```python
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_starter_price_id: str = ""
    stripe_pro_price_id: str = ""
```

**Step 2: Create webhook handler**

Create `backend/app/routers/stripe_webhooks.py` with handlers for:
- `checkout.session.completed` → Create/upgrade subscription, grant credits
- `invoice.paid` → Monthly credit renewal
- `customer.subscription.updated` → Plan change
- `customer.subscription.deleted` → Downgrade to free

**Step 3: Register router**

Add to `backend/app/main.py`.

**Step 4: Commit**

```bash
git add backend/app/routers/stripe_webhooks.py backend/app/config.py backend/app/main.py
git commit -m "feat: add Stripe webhook handler for subscriptions and credits"
```

---

### Task 18: Create checkout & billing endpoints

**Files:**
- Create: `backend/app/routers/billing.py`

**Step 1: Create billing router**

Endpoints:
- `POST /api/billing/checkout` → Create Stripe Checkout session for subscription
- `POST /api/billing/buy-credits` → Create Checkout session for credit pack
- `GET /api/billing/portal` → Generate Stripe Customer Portal URL

**Step 2: Register router**

**Step 3: Commit**

```bash
git add backend/app/routers/billing.py backend/app/main.py
git commit -m "feat: add billing endpoints for checkout and customer portal"
```

---

### Task 19: Create Pricing page (frontend)

**Files:**
- Create: `frontend/src/app/pricing/page.tsx`

**Step 1: Create pricing page**

Three-column pricing cards (Free / Starter / Pro) with:
- Feature lists
- Monthly credit amounts
- CTA buttons linking to Stripe Checkout
- Current plan indicator
- Credit pack add-on section below

**Step 2: Commit**

```bash
git add frontend/src/app/pricing/page.tsx
git commit -m "feat: add pricing page with subscription plans and credit packs"
```

---

### Task 20: Wire up conversion with credit spending

**Files:**
- Modify: `backend/app/routers/jobs.py`

**Step 1: Add credit check to job creation**

Modify the `generate-book/{book_id}` endpoint to:
1. Calculate credits needed
2. Check user has sufficient balance
3. Deduct credits and create Purchase record
4. Create jobs (existing logic)
5. On failure: refund credits

**Step 2: Commit**

```bash
git add backend/app/routers/jobs.py
git commit -m "feat: integrate credit system with audiobook generation"
```

---

## Phase 4: Cloud Deployment

### Task 21: Add PostgreSQL support to database.py

**Files:**
- Modify: `backend/app/database.py`
- Modify: `backend/app/config.py`

**Step 1: Make database URL configurable**

Update `backend/app/database.py` to:
- Support both SQLite and PostgreSQL URLs
- Use `asyncpg` for PostgreSQL
- Keep `aiosqlite` for local dev

**Step 2: Commit**

```bash
git add backend/app/database.py backend/app/config.py
git commit -m "feat: add PostgreSQL support alongside SQLite"
```

---

### Task 22: Add S3/R2 storage service

**Files:**
- Create: `backend/app/services/cloud_storage.py`
- Modify: `backend/app/routers/jobs.py`
- Modify: `backend/app/routers/voices.py`

**Step 1: Create cloud storage service**

`backend/app/services/cloud_storage.py`:
- Upload audio files to R2
- Generate signed download URLs (1hr expiry)
- Fallback to local storage if S3 not configured

**Step 2: Update routes to use cloud storage**

Modify audio serving to use signed URLs from R2 instead of local file paths.

**Step 3: Commit**

```bash
git add backend/app/services/cloud_storage.py backend/app/routers/jobs.py backend/app/routers/voices.py
git commit -m "feat: add Cloudflare R2 storage with signed URLs"
```

---

### Task 23: Create production deployment configs

**Files:**
- Create: `backend/Dockerfile.prod`
- Create: `frontend/Dockerfile.prod`
- Modify: `docker-compose.yml` (add production profile)
- Create: `railway.json`
- Create: `vercel.json`

**Step 1: Create production Dockerfiles**

Optimized multi-stage builds for backend and frontend.

**Step 2: Create deployment configs**

Railway config for backend, Vercel config for frontend.

**Step 3: Commit**

```bash
git add backend/Dockerfile.prod frontend/Dockerfile.prod railway.json vercel.json
git commit -m "chore: add production deployment configurations"
```

---

## Phase 5: Polish & Launch

### Task 24: Add download feature

**Files:**
- Create: `backend/app/routers/downloads.py`
- Modify: Frontend book detail page

**Step 1: Create download endpoints**

- `GET /api/downloads/{purchase_id}/chapter/{chapter_id}` → Single chapter MP3
- `GET /api/downloads/{purchase_id}/full` → Full book MP3 (ffmpeg concat)

Both require valid purchase and return signed R2 URLs.

**Step 2: Add download UI to book detail**

**Step 3: Commit**

```bash
git add backend/app/routers/downloads.py
git commit -m "feat: add chapter and full book download endpoints"
```

---

### Task 25: Add onboarding flow

**Files:**
- Create: `frontend/src/components/Onboarding.tsx`

**Step 1: Create onboarding modal/wizard**

Shows for new users (no books uploaded yet):
1. Welcome message
2. Upload first EPUB or browse demos
3. Choose a voice
4. "3 free credits to start!"

**Step 2: Commit**

```bash
git add frontend/src/components/Onboarding.tsx
git commit -m "feat: add new user onboarding wizard"
```

---

### Task 26: Add mobile responsive hamburger menu

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx`
- Create: `frontend/src/components/MobileNav.tsx`

**Step 1: Create mobile navigation**

Hamburger button visible on mobile, opens sidebar as overlay.

**Step 2: Commit**

```bash
git add frontend/src/components/Sidebar.tsx frontend/src/components/MobileNav.tsx
git commit -m "feat: add mobile responsive hamburger menu"
```

---

### Task 27: Add error handling and loading states

**Files:**
- Create: `frontend/src/components/LoadingSpinner.tsx`
- Create: `frontend/src/components/ErrorBoundary.tsx`
- Modify: All page components

**Step 1: Create reusable components**

Loading spinner, error boundary, empty state components.

**Step 2: Add to all pages**

Wrap async data loading with loading/error states.

**Step 3: Commit**

```bash
git add frontend/src/components/
git commit -m "feat: add error boundaries and loading states throughout"
```

---

### Task 28: SEO and meta tags

**Files:**
- Modify: `frontend/src/app/layout.tsx`
- Create: `frontend/src/app/opengraph-image.tsx`

**Step 1: Add comprehensive meta tags**

Title, description, OpenGraph, Twitter cards, favicon.

**Step 2: Commit**

```bash
git add frontend/src/app/layout.tsx frontend/src/app/opengraph-image.tsx
git commit -m "feat: add SEO meta tags and OpenGraph images"
```

---

### Task 29: Rate limiting and abuse prevention

**Files:**
- Create: `backend/app/middleware/rate_limit.py`
- Modify: `backend/app/main.py`

**Step 1: Add rate limiting middleware**

- Free tier: 10 requests/minute
- Paid tiers: 60 requests/minute
- Conversion endpoints: Stricter limits

**Step 2: Commit**

```bash
git add backend/app/middleware/rate_limit.py backend/app/main.py
git commit -m "feat: add rate limiting middleware for API abuse prevention"
```

---

## Summary

| Phase | Tasks | Est. Time |
|-------|-------|-----------|
| 1: Auth & User Model | Tasks 1-10 | 1-2 days |
| 2: UI Overhaul | Tasks 11-16 | 2-3 days |
| 3: Stripe Integration | Tasks 17-20 | 2-3 days |
| 4: Cloud Deployment | Tasks 21-23 | 1-2 days |
| 5: Polish & Launch | Tasks 24-29 | 1-2 days |
| **Total** | **29 tasks** | **~8-12 days** |
