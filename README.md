# AjoGuard

> A tamper-evident backend reconciliation engine for informal savings groups (Ajo/Esusu)

AjoGuard is a pure backend system that brings trust, transparency, and verifiable record-keeping to the informal rotating savings and credit associations (ROSCAs) that millions of Nigerians depend on daily. It works through web form inputs and a Telegram bot — no smartphone app required for end users.

---

## The Problem

Millions of Nigerians participate in **Ajo** or **Esusu** — informal rotating savings groups where members contribute a fixed amount every week or month, and the full pot rotates to one member each cycle. These groups run entirely on trust and paper records, which creates daily problems:

| Problem | Impact |
|---|---|
| Collector disappears with money | Members lose savings with no proof of payment |
| Disputes over who paid | Groups break up, friendships end |
| No transparency into group balance | Information gap enables fraud |
| No financial history | Members cannot access microfinance loans |

AjoGuard solves these problems by acting as an **invisible trust layer** — the group keeps operating exactly as before, but every transaction is now recorded with cryptographic proof.

> AjoGuard never touches money. It only records that money changed hands.

---

## How It Works

```
Collector collects cash from members (same as always)
         ↓
Collector logs the contribution via web form or the Telegram bot
         ↓
AjoGuard validates, deduplicates, and saves the record
         ↓
Background worker runs reconciliation, writes audit log, sends notifications
         ↓
Members receive Telegram confirmation of their payment
         ↓
Weekly summaries sent to all members automatically
         ↓
Verifiable export reports available for disputes or loan applications
```

---

## Architecture

```
                        AjoGuard System
─────────────────────────────────────────────────────────

INPUT                   PROCESSING              STORAGE
─────                   ──────────              ───────

Web form   ─┐
Telegram   ─┼─→ Normaliser ─→ Save ─→ Queue ─→ PostgreSQL
            │    (validates)         (BullMQ)  (Neon)
                                         │
                                         ↓
                                      Worker
                                    (processor)
                                         │
                              ┌──────────┼──────────┐
                              ↓          ↓          ↓
                         Reconcile   AuditLog   Notify
                              │          │          │
                              └──────────┴──────────┘
                                         │
                                         ↓
                                   PostgreSQL
                              (status → PROCESSED)
```

### Key Design Decisions

**Channel-agnostic ingestion** — web form and Telegram inputs all pass through the same normaliser. The reconciliation engine never knows or cares which channel a contribution came from.

**Queue-based processing** — contributions are saved and acknowledged immediately. Reconciliation, audit logging, and notifications happen asynchronously in the background via BullMQ. This keeps response times fast even under poor network conditions.

**Tamper-evident audit log** — every contribution is recorded as a hash-chained, HMAC-signed entry. Modifying, deleting, or reordering any record breaks the chain and is detected immediately by the verification scanner.

**Idempotent ingestion** — duplicate submissions (common when network drops mid-send) are detected and rejected using a SHA256 fingerprint of the transaction within a 60-second window.

---

## Tech Stack

| Technology | Purpose |
|---|---|
| **NestJS** | Backend framework |
| **PostgreSQL** (Docker) | Primary database |
| **Supabase** | Dedicated Postgres VM per project |
| **Drizzle ORM** | Database queries and migrations |
| **Redis** (Docker) | Queue storage |
| **BullMQ** | Background job processing |
| **Telegram Bot API** | Telegram bot ingestion and notifications |
| **Google OAuth** | Collector & member authentication |
| **PDFKit** | PDF report generation |
| **@nestjs/schedule** | Nightly reconciliation and weekly summaries |
| **Helmet** | Security headers |
| **Swagger** | API documentation |
| **Bull Board** | Queue monitoring dashboard |

---

## Features

### Core
- ✅ Multi-tenant — thousands of independent groups on one system
- ✅ Two input channels — web form, Telegram
- ✅ Channel-agnostic normaliser — one validation pipeline for all inputs
- ✅ Idempotent contribution ingestion — duplicate detection via SHA-256
- ✅ Background job processing with automatic retries and dead-letter queue

### Reconciliation
- ✅ Per-contribution reconciliation after every payment
- ✅ Nightly scheduled reconciliation across all active groups
- ✅ Missing payment detection and flagging
- ✅ Cycle-based balance and payout rotation tracking

### Audit Trail
- ✅ Hash-chained audit log entries (SHA-256)
- ✅ HMAC signatures on every entry (server authenticity proof)
- ✅ Append-only records — database user has no UPDATE/DELETE on audit_logs
- ✅ Verification scanner — detects broken chains, hash mismatches, invalid signatures

### Notifications
- ✅ Payment confirmation Telegram message to member after every contribution
- ✅ Missing payment alerts to collector and late members
- ✅ Weekly group summary to all members
- ✅ Notification log with delivery tracking

### Export & Observability
- ✅ Full group report — JSON, PDF, CSV
- ✅ Individual member contribution history — JSON, PDF, CSV
- ✅ Audit integrity proof embedded in every report
- ✅ Loan-ready financial history reports
- ✅ Health/readiness endpoints for load balancers
- ✅ CSV-injection-proof exports and structured request logging

---

## Getting Started

### Prerequisites

- Node.js v20+
- Docker Desktop (for optional local Redis)
- A PostgreSQL / Neon database

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/ajoguard-backend.git
cd ajoguard-backend

# Install dependencies
npm install

# Start Redis & Postgres
docker run -d --name ajoguard-redis -p 6379:6379 redis
docker run -d --name postgres-db -p 5432:5432 postgres

# Set up environment variables
cp .env.example .env
# Fill in your values (see Environment Variables section below)

# Run database migrations
npx drizzle-kit generate
npx drizzle-kit migrate

# Start the development server
npm run start:dev
```

### Running with PostgreSQL locally (bare metal)

If you don't have an existing database, start one:

```bash
docker run -d --name postgres-db -p 5432:5432 -e POSTGRES_PASSWORD=password -e POSTGRES_DB=ajoguard -e POSTGRES_USER=postgres postgres:16-alpine
# Then set DATABASE_URL=postgresql://postgres:password@localhost:5432/ajoguard
```

---

## Environment Variables

Create a `.env` file in the root of the project with the following variables:

```env
# Database
DATABASE_URL=postgresql://username:password@host:5432/ajoguard
# When true/1, forces SSL for the database connection (default true in production)
DATABASE_SSL=1
DATABASE_SSL_REJECT_UNAUTHORIZED=1
# If a Neon/Neon-compatible pooled connection string, leave as-is; otherwise add ?sslmode=require

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# App
PORT=3000
NODE_ENV=development
# Comma-separated list of allowed CORS origins (defaults to localhost dev origins)
CORS_ORIGINS=http://localhost:3000,http://localhost:5173

# Audit log signing key
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
AUDIT_HMAC_SECRET=your_long_random_secret_here

# Telegram
# Create a bot via @BotFather to get a token.
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
# Public URL of this app that Telegram calls, e.g. https://api.yourdomain.com/ingest/telegram/webhook
TELEGRAM_WEBHOOK_URL=
# Optional secret echoed back in the x-telegram-bot-api-secret-token header
TELEGRAM_WEBHOOK_SECRET=

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
```

> Never commit your `.env` file. It is git-ignored.

---

## API Endpoints

### Auth

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/auth/google` | Start Google OAuth (login / register / join via query params) |
| `GET` | `/auth/google/callback` | Google OAuth callback — returns the AjoGuard JWT |
| `POST` | `/auth/google/login` | Exchange a Google ID token (SPA/mobile) for a JWT |
| `POST` | `/auth/google/register` | Register a collector + group (or join via `joinCode`) with a Google ID token |
| `POST` | `/auth/refresh` | Refresh an expiring JWT |

### Health

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Liveness probe — returns process status and uptime |
| `GET` | `/health/ready` | Readiness probe — verifies database connectivity (503 if down) |

### Groups

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/groups` | Create a new savings group |
| `GET` | `/groups` | Get all groups (paginated) |
| `GET` | `/groups/:id` | Get a single group |
| `GET` | `/groups/:id/summary` | Get group financial summary |
| `GET` | `/groups/:id/audit` | View audit log history |
| `GET` | `/groups/:id/audit/verify` | Verify audit chain integrity |
| `POST` | `/groups/:id/payout` | Record a payout |
| `PATCH` | `/groups/:id/deactivate` | Deactivate a group |

### Members

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/members` | Add a member to a group |
| `GET` | `/members/group/:groupId` | Get all members in a group |
| `GET` | `/members/:id` | Get a single member |
| `PATCH` | `/members/:id/deactivate` | Deactivate a member |

### Contributions

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/contributions/group/:groupId` | Get all contributions for a group |
| `GET` | `/contributions/member/:memberId` | Get all contributions for a member |
| `GET` | `/contributions/:id` | Get a single contribution |

### Ingestion (Input Channels)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/ingest/web` | Record contribution via web form (collector only) |
| `POST` | `/ingest/telegram/webhook` | Telegram bot webhook |
| `POST` | `/ingest/telegram/set-webhook` | Point the bot at this app's public URL (collector only) |

### Export

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/export/group/:groupId` | Download group report as JSON |
| `GET` | `/export/group/:groupId/pdf` | Download group report as PDF |
| `GET` | `/export/group/:groupId/csv` | Download group report as CSV |
| `GET` | `/export/member/:memberId` | Download member report as JSON |
| `GET` | `/export/member/:memberId/pdf` | Download member report as PDF |
| `GET` | `/export/member/:memberId/csv` | Download member report as CSV |

Full interactive API documentation is available at:

```
http://localhost:3000/api
```

Queue monitoring dashboard:

```
http://localhost:3000/admin/queues
```

---

## Project Structure

```
ajoguard
├─ src
│  ├─ main.ts                     # Bootstrap: Helmet, CORS, validation, Swagger
│  ├─ app.module.ts               # Root module wiring
│  ├─ common/                     # Shared infrastructure
│  │  ├─ all-exceptions.filter.ts      # Uniform JSON error envelope + requestId
│  │  ├─ request-logger.middleware.ts  # Structured request logging
│  │  └─ dto/pagination.dto.ts
│  ├─ config/env.validation.ts    # Fail-fast env validation
│  ├─ db/
│  │  ├─ schema.ts                # Drizzle schema
│  │  └─ drizzle_db.service.ts    # Postgres pool + Drizzle client
│  ├─ auth/                       # Google OAuth, JWT, RBAC guards
│  ├─ groups/                     # Group CRUD, join codes, payouts
│  ├─ members/                    # Member CRUD
│  ├─ contributions/              # Queries + BullMQ processor
│  ├─ ingest/                     # Channel adapters (web, Telegram)
│  ├─ normaliser/                 # Validation/dedupe pipeline
│  ├─ reconciliation/             # Health checks & cycle accounting
│  ├─ audit/                      # Tamper-evident audit chain
│  ├─ notification/               # Telegram/email notifications
│  ├─ export/                     # JSON/PDF/CSV reports
│  ├─ health/                     # Liveness/readiness probes
│  └─ utils/                      # Shared helpers (e.g. phone)
├─ drizzle/                       # Migrations + snapshots
├─ test/                          # e2e tests
├─ drizzle.config.ts
├─ Dockerfile                     # Multi-stage production image
├─ Procfile                       # Heroku/Railway web process
├─ vercel.json
├─ package.json
└─ tsconfig.json
```

---

## How the Audit Log Works

Every contribution that passes through the normaliser gets a tamper-evident audit log entry written by the background processor.

Each entry contains:

- **prevHash** — the SHA-256 hash of the previous entry, linking entries into a chain
- **entryData** — a frozen snapshot of the contribution at processing time
- **entryHash** — SHA-256(prevHash + entryData), proving integrity
- **hmacSig** — HMAC-SHA-256(entryHash, serverSecret), proving server authenticity

**What this protects against:**

| Attack | How it is detected |
|---|---|
| Modifying a record | entryHash no longer matches recomputed hash |
| Deleting a record | prevHash of the next entry breaks |
| Inserting a fake record | hmacSig cannot be forged without the server secret |
| Reordering records | prevHash chain breaks immediately |

Verify the audit chain for any group at any time:

```
GET /groups/:id/audit/verify
```

Response when chain is intact:

```json
{
  "valid": true,
  "totalEntries": 47,
  "verifiedAt": "2026-04-27T10:30:00.000Z"
}
```

---

## How Reconciliation Works

Reconciliation runs in two modes:

**Per-contribution** — triggered automatically after every contribution is processed by the queue worker. Checks whether the group's current cycle is fully paid.

**Nightly** — runs at midnight every day across all active groups. Flags any members who have not paid in the current cycle and triggers alerts.

A reconciliation result looks like:

```json
{
  "status": "DISCREPANCY",
  "totalExpected": 500000,
  "totalCollected": 400000,
  "missingMembers": [
    {
      "memberName": "Bola Adekunle",
      "phoneNumber": "+2348033333333",
      "amountMissing": 500000
    }
  ]
}
```

When a discrepancy is found, the worker automatically sends:

- An alert to the collector listing missing members
- A reminder directly to each missing member

---

## Telegram Format

Collectors send contributions to the bot in this format:

```
PAY <memberPhoneNumber> <amountInNaira>
```

Example:

```
PAY 08012345678 5000
```

This records a ₦5,000 contribution from the member whose phone number is `08012345678`, identified from the linked collector's group. First, link your Telegram account as a collector:

```
/link <yourPhoneNumber>
```

---

## Audit Integrity in Exports

AjoGuard generates three types of downloadable reports:

**Group Report** — complete financial history of a savings group including all members, contributions, payouts, and audit chain verification. Useful for dispute resolution and regulatory compliance.

**Member Report** — individual contribution history for a single member including total contributed, cycles completed, and financial consistency metrics. Specifically designed for microfinance loan applications.

Both reports embed an **audit integrity proof** that mathematically verifies no records were modified since they were written.

---

## Deployment

### Docker

```bash
docker build -t ajoguard .
docker run -p 3000:3000 --env-file .env ajoguard
```

### Heroku / Railway / Render (Procfile)

```bash
npm run build
node --max-old-space-size=512 dist/src/main.js
```

Make sure Redis is reachable before starting the application — startup depends on the queue connection.

---

## Health & Observability

- `GET /health` — liveness probe (process alive + uptime)
- `GET /health/ready` — readiness probe (DB connectivity; 503 when down)

Every request is given a `X-Request-Id` header and logged as a single structured JSON line (method, path, status, duration, actor) via the request logger middleware. Errors are returned in a uniform JSON envelope with a `requestId` for tracing.

---

## Contributing

This is a solo project and a proof of work demonstrating production-grade backend engineering. Issues and suggestions are welcome via GitHub Issues.

---

## License

MIT

---

*Built to bring trust to the informal savings economy.*