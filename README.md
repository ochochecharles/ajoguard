# AjoGuard

> A tamper-evident backend reconciliation engine for informal savings groups (Ajo/Esusu)

AjoGuard is a pure backend system that brings trust, transparency, and verifiable record-keeping to the informal rotating savings and credit associations (ROSCAs) that millions of Nigerians depend on daily. It works entirely through SMS, WhatsApp, and web form inputs — no smartphone app required for end users.

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
Collector logs the contribution via SMS, WhatsApp, or web form
         ↓
AjoGuard validates, deduplicates, and saves the record
         ↓
Background worker runs reconciliation, writes audit log, sends notifications
         ↓
Members receive SMS confirmation of their payment
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

Web form   ─┐                                   PostgreSQL
SMS        ─┼─→ Normaliser ─→ Save ─→ Queue ─→ (Neon)
WhatsApp   ─┘    (validates)         (BullMQ)
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

**Channel-agnostic ingestion** — SMS, WhatsApp, and web form inputs all pass through the same normaliser. The reconciliation engine never knows or cares which channel a contribution came from.

**Queue-based processing** — contributions are saved and acknowledged immediately. Reconciliation, audit logging, and notifications happen asynchronously in the background via BullMQ. This keeps response times fast even under poor Nigerian network conditions.

**Tamper-evident audit log** — every contribution is recorded as a hash-chained, HMAC-signed entry. Modifying, deleting, or reordering any record breaks the chain and is detected immediately by the verification scanner.

**Idempotent ingestion** — duplicate submissions (common when network drops mid-send) are detected and rejected using a SHA256 fingerprint of the transaction within a 60-second window.

---

## Tech Stack

| Technology | Purpose |
|---|---|
| **NestJS** | Backend framework |
| **PostgreSQL** (Neon) | Primary database |
| **Drizzle ORM** | Database queries and migrations |
| **Redis** (Docker) | Queue storage |
| **BullMQ** | Background job processing |
| **Africa's Talking** | SMS sending and receiving |
| **Meta Cloud API** | WhatsApp webhook integration |
| **PDFKit** | PDF report generation |
| **@nestjs/schedule** | Nightly reconciliation and weekly summaries |
| **Swagger** | API documentation |
| **Bull Board** | Queue monitoring dashboard |

---

## Features

### Core
- ✅ Multi-tenant — thousands of independent groups on one system
- ✅ Three input channels — web form, SMS, WhatsApp
- ✅ Channel-agnostic normaliser — one validation pipeline for all inputs
- ✅ Idempotent contribution ingestion — duplicate detection via SHA256
- ✅ Background job processing with automatic retries and dead-letter queue

### Reconciliation
- ✅ Per-contribution reconciliation after every payment
- ✅ Nightly scheduled reconciliation across all active groups
- ✅ Missing payment detection and flagging
- ✅ Group balance calculation
- ✅ Payout rotation tracking

### Audit Trail
- ✅ Hash-chained audit log entries (SHA256)
- ✅ HMAC signatures on every entry (server authenticity proof)
- ✅ Append-only records — database user has no UPDATE/DELETE on audit_logs
- ✅ Verification scanner — detects broken chains, hash mismatches, invalid signatures

### Notifications
- ✅ Payment confirmation SMS to member after every contribution
- ✅ Missing payment alerts to collector and late members
- ✅ Weekly group summary to all members
- ✅ Notification log with delivery tracking

### Export
- ✅ Full group report — JSON, PDF, CSV
- ✅ Individual member contribution history — JSON, PDF, CSV
- ✅ Audit integrity proof embedded in every report
- ✅ Loan-ready financial history reports

---

## Getting Started

### Prerequisites

- Node.js v20+
- Docker Desktop (for Redis)
- PostgreSQL database (Neon recommended)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/ajoguard-backend.git
cd ajoguard-backend

# Install dependencies
npm install

# Start Redis
docker run -d --name ajoguard-redis -p 6379:6379 redis

# Set up environment variables
cp .env.example .env
# Fill in your values (see Environment Variables section below)

# Run database migrations
npx drizzle-kit generate
npx drizzle-kit migrate

# Start the development server
npm run start:dev
```

---

## Environment Variables

Create a `.env` file in the root of the project with the following variables:

```env
# Database
DATABASE_URL=postgresql://username:password@host:5432/ajoguard

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# App
PORT=3000
NODE_ENV=development

# Audit log signing key
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
AUDIT_HMAC_SECRET=your_long_random_secret_here

# Africa's Talking (SMS)
AT_API_KEY=your_api_key
AT_USERNAME=your_username
AT_SENDER_ID=your_shortcode

# Meta WhatsApp (Cloud API)
META_WHATSAPP_TOKEN=your_access_token
META_PHONE_NUMBER_ID=your_phone_number_id
META_VERIFY_TOKEN=your_webhook_verify_token
```

> Never commit your `.env` file. It is listed in `.gitignore`.

---

## API Endpoints

### Groups

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/groups` | Create a new savings group |
| `GET` | `/groups` | Get all groups |
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
| `POST` | `/ingest/web` | Record contribution via web form |
| `POST` | `/ingest/sms` | Africa's Talking SMS webhook |
| `GET` | `/ingest/whatsapp` | Meta webhook verification |
| `POST` | `/ingest/whatsapp` | Meta WhatsApp webhook |

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
├─ .prettierrc
├─ comment.txt
├─ drizzle
│  ├─ 0000_steep_korath.sql
│  ├─ 0001_mushy_blackheart.sql
│  └─ meta
│     ├─ 0000_snapshot.json
│     ├─ 0001_snapshot.json
│     └─ _journal.json
├─ drizzle.config.ts
├─ eslint.config.mjs
├─ LICENSE
├─ nest-cli.json
├─ package-lock.json
├─ package.json
├─ README.md
├─ src
│  ├─ app.controller.spec.ts
│  ├─ app.controller.ts
│  ├─ app.module.ts
│  ├─ app.service.ts
│  ├─ audit
│  │  ├─ audit.module.ts
│  │  ├─ audit.service.spec.ts
│  │  └─ audit.service.ts
│  ├─ bull-board.setup.ts
│  ├─ contributions
│  │  ├─ contribution.processor
│  │  │  ├─ contribution.processor.service.spec.ts
│  │  │  └─ contribution.processor.service.ts
│  │  ├─ contributions.controller.spec.ts
│  │  ├─ contributions.controller.ts
│  │  ├─ contributions.module.ts
│  │  ├─ contributions.service.spec.ts
│  │  ├─ contributions.service.ts
│  │  ├─ dto
│  │  │  └─ create-contribution.dto.ts
│  │  └─ interfaces
│  │     └─ contribution-event.interface.ts
│  ├─ db
│  │  ├─ drizzle_db
│  │  │  ├─ drizzle_db.module.ts
│  │  │  ├─ drizzle_db.service.spec.ts
│  │  │  └─ drizzle_db.service.ts
│  │  └─ schema.ts
│  ├─ export
│  │  ├─ export.controller.spec.ts
│  │  ├─ export.controller.ts
│  │  ├─ export.module.ts
│  │  ├─ export.service.spec.ts
│  │  └─ export.service.ts
│  ├─ groups
│  │  ├─ dto
│  │  │  └─ create-group.dto.ts
│  │  ├─ groups.controller.spec.ts
│  │  ├─ groups.controller.ts
│  │  ├─ groups.module.ts
│  │  ├─ groups.service.spec.ts
│  │  └─ groups.service.ts
│  ├─ ingest
│  │  ├─ ingest.controller.spec.ts
│  │  ├─ ingest.controller.ts
│  │  ├─ ingest.module.ts
│  │  ├─ sms.parser
│  │  │  ├─ sms.parser.service.spec.ts
│  │  │  └─ sms.parser.service.ts
│  │  ├─ whatsapp-reply
│  │  │  ├─ whatsapp-reply.service.spec.ts
│  │  │  └─ whatsapp-reply.service.ts
│  │  └─ whatsapp.parser
│  │     ├─ whatsapp.parser.service.spec.ts
│  │     └─ whatsapp.parser.service.ts
│  ├─ main.ts
│  ├─ members
│  │  ├─ dto
│  │  │  └─ create-member.dto.ts
│  │  ├─ members.controller.spec.ts
│  │  ├─ members.controller.ts
│  │  ├─ members.module.ts
│  │  ├─ members.service.spec.ts
│  │  └─ members.service.ts
│  ├─ normaliser
│  │  ├─ normaliser.module.ts
│  │  ├─ normaliser.service.spec.ts
│  │  └─ normaliser.service.ts
│  ├─ notification
│  │  ├─ notification.module.ts
│  │  ├─ notification.service.spec.ts
│  │  └─ notification.service.ts
│  ├─ reconciliation
│  │  ├─ reconciliation.module.ts
│  │  ├─ reconciliation.service.spec.ts
│  │  └─ reconciliation.service.ts
│  └─ utils
│     └─ phone.util.ts
├─ test
│  ├─ app.e2e-spec.ts
│  └─ jest-e2e.json
├─ tsconfig.build.json
└─ tsconfig.json

```

---

## How the Audit Log Works

Every contribution that passes through the normaliser gets a tamper-evident audit log entry written by the background processor.

Each entry contains:
- **prevHash** — the SHA256 hash of the previous entry, linking entries into a chain
- **entryData** — a frozen snapshot of the contribution at processing time
- **entryHash** — SHA256(prevHash + entryData), proving integrity
- **hmacSig** — HMAC-SHA256(entryHash, serverSecret), proving server authenticity

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

**Per-contribution** — triggered automatically after every payment is processed by the queue worker. Checks whether the group's current state is healthy.

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

When a discrepancy is found, the notification worker automatically sends:
- An alert to the collector listing missing members
- A reminder directly to each missing member

---

## SMS Format

Collectors send SMS contributions in this format:

```
PAY <memberPhoneNumber> <amountInNaira>
```

Example:
```
PAY 08012345678 5000
```

This records a ₦5,000 contribution from the member whose phone number is `08012345678`. The system identifies the group automatically from the collector's registered phone number.

---

## Export Reports

AjoGuard generates three types of downloadable reports:

**Group Report** — complete financial history of a savings group including all members, contributions, payouts, reconciliation history, and audit chain verification. Useful for dispute resolution and regulatory compliance.

**Member Report** — individual contribution history for a single member including total contributed, cycles completed, payout history, and financial consistency metrics. Specifically designed for microfinance loan applications.

Both reports embed an **audit integrity proof** that mathematically verifies no records were modified since they were written.

---

## Running in Production

```bash
# Build
npm run build

# Start production server
npm run start:prod
```

Make sure Redis is running before starting the server. The application will fail to start if it cannot connect to Redis.

---

## Contributing

This is a solo project built as a proof of work demonstrating production-grade backend engineering. Issues and suggestions are welcome via GitHub Issues.

---

## License

MIT

---

*Built to bring trust to the informal savings economy.*