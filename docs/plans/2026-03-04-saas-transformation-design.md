# AudioBookAI SaaS Transformation — Design Document

**Date**: 2026-03-04
**Status**: Approved (pricing TBD)

## Summary

Transform the existing local-first audiobook generation app into an international SaaS product with user authentication, subscription + credit-based pricing, cloud deployment (split architecture), and a polished user interface with profiles, settings, and an enhanced library browser.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Target market | International SaaS | Broader audience, scalable revenue |
| Pricing model | Subscription + credits | Best recurring revenue, flexible usage |
| Auth provider | NextAuth.js | Self-hosted, free, full control, social login |
| Infrastructure | Split architecture | Cost-optimized: pay for GPU only when generating |
| Approach | Incremental (5 phases) | Always-working app, lower risk |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Vercel (Free Tier)                                         │
│  ┌────────────────────────────────────────────┐             │
│  │ Next.js Frontend + NextAuth.js             │             │
│  │ • SSR pages, API routes (auth only)        │             │
│  │ • Stripe webhooks proxy                    │             │
│  └──────────────────┬─────────────────────────┘             │
└─────────────────────┼───────────────────────────────────────┘
                      │ HTTPS
┌─────────────────────┼───────────────────────────────────────┐
│  Railway (~$15-20/mo)                                       │
│  ┌──────────────────┴─────────────────────────┐             │
│  │ FastAPI Backend                            │             │
│  │ • REST API (user-scoped)                   │             │
│  │ • Job management                           │             │
│  │ • Stripe webhook handler                   │             │
│  │ • Credit management                        │             │
│  └────┬──────────────┬────────────────────────┘             │
│       │              │                                      │
│  ┌────┴────┐    ┌────┴────┐                                 │
│  │PostgreSQL│    │  Redis  │                                 │
│  └─────────┘    └─────────┘                                 │
└─────────────────────────────────────────────────────────────┘
                      │ Job Queue
┌─────────────────────┼───────────────────────────────────────┐
│  RunPod Serverless (pay-per-second GPU)                     │
│  ┌──────────────────┴─────────────────────────┐             │
│  │ TTS Worker (XTTS-v2)                       │             │
│  │ • Pulls jobs from Redis                    │             │
│  │ • Generates audio → uploads to R2          │             │
│  └────────────────────────────────────────────┘             │
└─────────────────────────────────────────────────────────────┘
                      │
┌─────────────────────┼───────────────────────────────────────┐
│  Cloudflare R2 (10GB free, $0.015/GB after)                 │
│  • Audio files (signed URLs)                                │
│  • Voice reference clips                                    │
│  • Book cover images                                        │
└─────────────────────────────────────────────────────────────┘
```

### Cost Estimate (monthly)

| Service | Free tier | With ~100 users |
|---------|-----------|-----------------|
| Vercel | $0 | $0 |
| Railway (backend + PG + Redis) | ~$5 | ~$15-20 |
| RunPod Serverless | pay-per-use | ~$10-50 (usage dependent) |
| Cloudflare R2 | 10GB free | ~$1-5 |
| Stripe fees | 2.9% + $0.30/txn | variable |
| **Total** | **~$5** | **~$30-75** |

## Data Model

### New Tables

```sql
-- Users (managed by NextAuth.js, extended)
users
  id            UUID PRIMARY KEY
  email         VARCHAR UNIQUE NOT NULL
  name          VARCHAR
  avatar_url    VARCHAR
  locale        VARCHAR(5) DEFAULT 'en'  -- 'en', 'hu', etc.
  created_at    TIMESTAMP DEFAULT NOW()
  updated_at    TIMESTAMP DEFAULT NOW()

-- Subscriptions (Stripe-synced)
subscriptions
  id                      SERIAL PRIMARY KEY
  user_id                 UUID REFERENCES users(id) UNIQUE
  stripe_customer_id      VARCHAR UNIQUE
  stripe_subscription_id  VARCHAR UNIQUE
  plan                    VARCHAR DEFAULT 'free'  -- 'free', 'starter', 'pro'
  status                  VARCHAR DEFAULT 'active' -- 'active', 'canceled', 'past_due'
  current_period_start    TIMESTAMP
  current_period_end      TIMESTAMP
  created_at              TIMESTAMP DEFAULT NOW()
  updated_at              TIMESTAMP DEFAULT NOW()

-- Credit Balances
credit_balances
  id          SERIAL PRIMARY KEY
  user_id     UUID REFERENCES users(id) UNIQUE
  balance     INTEGER DEFAULT 0  -- credits in smallest unit
  updated_at  TIMESTAMP DEFAULT NOW()

-- Credit Transactions (audit log)
credit_transactions
  id            SERIAL PRIMARY KEY
  user_id       UUID REFERENCES users(id)
  amount        INTEGER NOT NULL  -- positive = add, negative = spend
  type          VARCHAR NOT NULL  -- 'subscription_grant', 'purchase', 'conversion_spend', 'refund'
  description   VARCHAR
  reference_id  VARCHAR  -- stripe payment ID or job ID
  created_at    TIMESTAMP DEFAULT NOW()

-- Purchases (paid books — permanent access)
purchases
  id              SERIAL PRIMARY KEY
  user_id         UUID REFERENCES users(id)
  book_id         INTEGER REFERENCES books(id)
  voice_id        INTEGER REFERENCES voices(id)
  credits_spent   INTEGER NOT NULL
  status          VARCHAR DEFAULT 'pending'  -- 'pending', 'completed', 'failed'
  created_at      TIMESTAMP DEFAULT NOW()

-- User Settings
user_settings
  id                    SERIAL PRIMARY KEY
  user_id               UUID REFERENCES users(id) UNIQUE
  playback_speed        FLOAT DEFAULT 1.0
  audio_quality         VARCHAR DEFAULT 'standard'  -- 'standard', 'high'
  email_notifications   BOOLEAN DEFAULT true
  theme                 VARCHAR DEFAULT 'system'  -- 'light', 'dark', 'system'
  ui_language           VARCHAR(5) DEFAULT 'en'
  updated_at            TIMESTAMP DEFAULT NOW()
```

### Modified Existing Tables

All existing tables get a `user_id` foreign key for data isolation:

```sql
ALTER TABLE books ADD COLUMN user_id UUID REFERENCES users(id);
ALTER TABLE voices ADD COLUMN user_id UUID REFERENCES users(id);
ALTER TABLE voices ADD COLUMN is_public BOOLEAN DEFAULT false;
ALTER TABLE jobs ADD COLUMN user_id UUID REFERENCES users(id);
ALTER TABLE playback_state ADD COLUMN user_id UUID REFERENCES users(id);
```

## Pricing (TBD — placeholder values)

| Plan | Monthly | Credits/month | Extra credits |
|------|---------|---------------|---------------|
| Free | $0 | 3 credits | Not available |
| Starter | $9/mo | 30 credits | $0.50/credit |
| Pro | $29/mo | 100 credits | $0.35/credit |

**Credit calculation**: 1 credit ≈ 10,000 words (≈1 chapter). Average book (80,000 words) ≈ 8 credits.

> **Note**: These values are placeholders. Final pricing will be determined based on actual GPU costs and market research.

## Auth & User Management

### NextAuth.js Setup

**Providers**:
- Google OAuth (primary — international)
- GitHub OAuth (developer audience)
- Email magic link (fallback — no passwords)

**Session strategy**: JWT (stateless, Vercel-optimized)

**Auth flow**:
```
User clicks "Sign in with Google"
  → NextAuth.js OAuth flow
  → Callback: user created/updated in PostgreSQL
  → JWT token in httpOnly cookie
  → Every API call: Authorization: Bearer <token>
  → FastAPI validates JWT, extracts user_id
  → All queries scoped by user_id (data isolation)
```

### Profile Page (`/profile`)

- Name, email, avatar (from OAuth provider)
- Locale selection (en/hu)
- Current plan & credits balance
- Subscription management (upgrade/cancel → Stripe Customer Portal)
- Credit transaction history

### Settings Page (`/settings`)

- **Playback**: Default speed (0.5x – 2x)
- **Audio quality**: Standard / High
- **Notifications**: Email when conversion complete
- **Theme**: Light / Dark / System
- **Language**: UI language (en/hu)
- **Delete account**: GDPR compliance, soft delete + 30-day grace period

## Stripe Integration

### Products & Prices

1. **Subscription plans** (Stripe Billing): Free / Starter / Pro
2. **Credit pack add-ons** (Stripe Checkout Sessions): One-time purchases

### Webhook Flow

| Stripe Event | Backend Action |
|-------------|----------------|
| `checkout.session.completed` | Create/upgrade subscription, grant credits |
| `invoice.paid` | Monthly credit grant (subscription renewal) |
| `customer.subscription.updated` | Update plan status |
| `customer.subscription.deleted` | Downgrade to free |
| `payment_intent.succeeded` | Credit pack purchase → add credits |

### Credit System

**Before conversion** (user sees cost estimate):
```
User selects book + voice → "Convert to Audiobook"
  → Backend calculates: total_words / 10,000 = credits needed
  → UI displays: "This book requires ~8 credits (80,432 words)"
  → Shows: "Your balance: 24 credits" [Convert] [Cancel]
  → User confirms
  → Backend: deduct credits, create purchase, queue jobs
```

**Purchased books** (permanent access):
- `purchases` table tracks which books a user has paid for
- If `purchase.status = 'completed'` → **forever accessible** for listening + download
- No additional credits needed for re-listening or downloading
- Canceled subscription → existing purchases remain accessible

### Downloads

Purchased books are downloadable:
- **Chapter-by-chapter**: Individual WAV/MP3 files
- **Full book**: All chapters concatenated into single MP3 (via ffmpeg)
- Served via signed URLs from R2 (1-hour expiration)

## UI/UX Design

### Navigation (Sidebar + Top Bar)

```
┌──────────────────────────────────────────────────────┐
│  🎧 AudioBookAI          [Credits: 24] [🔔] [Avatar]│
├──────────┬───────────────────────────────────────────┤
│          │                                           │
│  📚 Library │  ← Main content area                  │
│  🎙️ Voices  │                                       │
│  📊 Queue   │                                       │
│  ──────── │                                         │
│  👤 Profile │                                       │
│  ⚙️ Settings│                                       │
│  ──────── │                                         │
│  💎 Upgrade │                                       │
│          │                                           │
├──────────┴───────────────────────────────────────────┤
│  🎵 [Persistent Player Bar]              ▶ 3:42/12:30│
└──────────────────────────────────────────────────────┘
```

### Library Page — Enhanced (`/`)

**Search & Filter**:
- Search by title, author
- Filters: Language, Status (Not started / In progress / Completed / Converting)
- Sort: Recently added / Title A-Z / Author / Last played

**View modes**: Grid view (cards) / List view (compact)

**Book Card**:
```
┌─────────────────────────┐
│  ┌─────┐                │
│  │COVER│  Book Title     │
│  │IMAGE│  by Author      │
│  └─────┘                │
│  ████████░░ 65% done     │
│  🎙️ Voice Name  📖 hu   │
│  ⏱️ 4h 32min estimated   │
└─────────────────────────┘
```

**Pagination**: Infinite scroll or explicit pagination (20 books/page)

### Book Detail — Enhanced (`/books/[id]`)

**Pre-conversion view** (cost estimation is key):
```
┌──────────────────────────────────────────────────┐
│  📖 Book Title                                   │
│  Author | Language | 12 chapters                 │
│                                                  │
│  🎙️ Voice: [Dropdown - select voice]            │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  💎 Conversion Cost Estimate               │  │
│  │  80,432 words → ~8 credits (~$2.80)        │  │
│  │  Your balance: 24 credits                  │  │
│  │                                            │  │
│  │  [🚀 Convert to Audiobook]                 │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  📋 Chapters                                     │
│  ┌────────────────────────────────────────────┐  │
│  │ ✓ 1. Chapter One          │ 6,240 words   │  │
│  │ ✓ 2. Chapter Two          │ 7,102 words   │  │
│  │ 🔄 3. Chapter Three       │ 5,891 words   │  │
│  │ ⏳ 4. ...                  │               │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

**Post-conversion** (purchased):
- ▶ Play button per chapter
- 📥 Download button (chapter / full book)
- Synchronized text highlighting during playback (timing data)

### Persistent Player Bar

```
┌────────────────────────────────────────────────────────┐
│  ◁◁  ▶  ▷▷  │  Chapter 3/12  │  ███████░░  3:42/12:30│
│  📖 Book Title  🎙️ Voice1  │  1x ▼  │  🔊 ████        │
└────────────────────────────────────────────────────────┘
```

Features: Skip chapter, 15s skip, speed control (0.5x-2x), volume, always visible.

### Onboarding (New Users)

```
Step 1: Welcome! → Sign in with Google
Step 2: Upload your first EPUB or browse demo books
Step 3: Choose a voice (or create custom)
Step 4: Convert — 3 free credits to start!
```

### Mobile Responsive

- Sidebar → hamburger menu
- Player bar stays at bottom
- Card grid → single column
- Touch-friendly controls

## Implementation Phases

### Phase 1: Auth & User Model (1-2 days)
- NextAuth.js setup (Google + GitHub + Email magic link)
- `users` and `user_settings` tables in PostgreSQL
- FastAPI JWT middleware (user-scoped queries)
- Login/Register UI
- Extend existing tables with `user_id`

### Phase 2: UI Overhaul (2-3 days)
- Sidebar navigation + layout shell
- Library: search, filter, sort, pagination
- Book Card redesign (progress, cover placeholder, estimated time)
- Profile page
- Settings page (theme, language, playback preferences)
- Persistent Player Bar (visible on all pages)
- Dark/Light theme support
- Mobile responsive design

### Phase 3: Stripe Integration (2-3 days)
- Stripe products/prices setup
- Subscription flow (Checkout → webhook → plan activated)
- Credit system (balance, transactions, grant/spend logic)
- Cost estimation UI (before conversion)
- Credit pack purchase (one-time checkout)
- Stripe Customer Portal link
- `purchases` table (permanent access tracking)

### Phase 4: Cloud Deployment (1-2 days)
- SQLite → PostgreSQL migration
- Local storage → Cloudflare R2 (signed URLs)
- Backend deploy to Railway
- Frontend deploy to Vercel
- Worker setup on RunPod Serverless
- Environment variables, secrets management
- CORS and domain configuration

### Phase 5: Polish & Launch (1-2 days)
- Download feature (chapter + full book MP3)
- Onboarding flow for new users
- Error handling & loading states throughout
- SEO & meta tags
- Demo books (free content for trial)
- Email notifications (conversion complete)
- Rate limiting & abuse prevention

**Total estimated effort**: ~8-12 days

## Migration Strategy

### Data Migration (SQLite → PostgreSQL)
1. Export existing SQLite data
2. Create PostgreSQL schema with new tables
3. Import data with generated UUIDs for user_id (assign to "admin" user)
4. Verify data integrity

### Storage Migration (Local → R2)
1. Set up Cloudflare R2 bucket
2. Upload existing audio files and voice clips
3. Update database paths to R2 keys
4. Switch backend to use S3-compatible client for all file operations

## Security Considerations

- JWT tokens in httpOnly cookies (XSS protection)
- CORS restricted to known domains
- Rate limiting on API endpoints
- Stripe webhook signature verification
- Signed URLs for audio files (time-limited access)
- User data isolation (all queries scoped by user_id)
- GDPR: account deletion with 30-day grace period
- Input sanitization on all user inputs

## Future Considerations (Not in scope)

- MEK (Magyar Elektronikus Könyvtár) integration
- PDF and TXT format support
- Real-time streaming TTS
- Mobile native app
- Team/organization accounts
- Voice marketplace (users sell custom voices)
- API access for developers
