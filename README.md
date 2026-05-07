# HisabDost AI / PakBooks AI MVP

Pakistan-focused AI bookkeeping + compliance assistant for an accounting firm that manages multiple client companies.

## What is included in this version

### Firm/client SaaS structure

- One main accounting firm workspace
- Firm Starter plan with **10 client company slots**
- No fake/sample clients are created by seed
- Firm owner/co-partners can add real client companies
- Client users can be invited per company so they only see their own company
- Firm users can switch between client companies from the top navbar

### Accounting core

- Expanded Pakistan SME chart of accounts
- Sales
- Purchases
- Expenses
- Customer payment received
- Supplier payment made
- Cash, bank, and JazzCash/Easypaisa wallet tracking
- Receivables and payables
- Ledgers for every account head
- Trial balance
- Profit & loss
- Balance sheet API
- Manual journal entries for accountant adjustments

### Document/OCR flow

- Receipt upload
- OCR processing with Google Vision, Tesseract, or mock fallback
- AI extraction of receipt fields
- Manual correction for bad handwriting / unclear OCR
- Approve uploaded receipt as expense or purchase
- Receipt image stays attached as proof

### AI assistant v2

- Roman Urdu / Urdu / English transaction parsing
- AI-suggested account head creation
- AI action queue with approval before changing accounting data
- AI report analysis
- Missing document message draft
- Monthly client review summary
- Safety rule: AI assists, accountant/user approves

## Tech stack

```txt
Frontend: Next.js + TypeScript + Tailwind
Backend: NestJS + TypeScript
Database: PostgreSQL
ORM: Prisma
Jobs/Cache: Redis placeholder
AI: OpenAI / Claude / Gemini-compatible provider layer
OCR: Google Vision / Tesseract / mock fallback
Storage: local uploads for MVP, S3/R2-ready later
```

## Local setup

```bash
corepack enable
corepack prepare pnpm@9.12.3 --activate
pnpm install

docker compose up -d

cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

pnpm db:generate
pnpm db:migrate
pnpm db:seed

pnpm dev
```

Open:

```txt
Frontend: http://localhost:3000
Backend:  http://localhost:4000/health
```

Demo login:

```txt
Email: demo@pakbooks.ai
Password: password123
```

After login, go to **Firm Dashboard** and add your first real client company. The seed creates only the firm owner and firm workspace, not sample clients.

## Important local reset after schema change

If you previously ran the older version and Prisma complains about schema changes, reset local DB:

```bash
docker compose down -v
docker compose up -d
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

## AI setup

Without keys, the app uses mock/rule fallback.

OpenAI:

```env
AI_PROVIDER="openai"
OPENAI_API_KEY="your-key"
OPENAI_MODEL="gpt-4o-mini"
```

Claude:

```env
AI_PROVIDER="anthropic"
ANTHROPIC_API_KEY="your-key"
ANTHROPIC_MODEL="claude-3-5-haiku-latest"
```

Gemini:

```env
AI_PROVIDER="gemini"
GEMINI_API_KEY="your-key"
GEMINI_MODEL="gemini-1.5-flash"
```

## OCR setup

Mock fallback is default.

Google Vision:

```env
OCR_PROVIDER="google-vision"
GOOGLE_VISION_API_KEY="your-key"
```

Tesseract local:

```env
OCR_PROVIDER="tesseract"
TESSERACT_BIN="tesseract"
TESSERACT_LANG="eng+urd"
```

## Main pages

```txt
/firm          Firm dashboard + 10 client slots
/dashboard     Selected client dashboard
/transactions  Sales, purchases, expenses, payments
/cash-bank     Cash/bank/wallet balances
/ledgers       Account ledgers
/accounts      Chart of accounts + AI head creation
/journals      Manual journal entries
/invoices      Invoice builder
/documents     Receipt upload + OCR + manual correction
/reports       P&L + trial balance + AI analysis
/chat          AI transaction assistant
/compliance    Compliance calendar
/accountant    Firm/client user access
```

## Product safety principle

The product should not claim to replace a CA or tax consultant.

AI can:

- suggest
- draft
- analyze
- summarize
- prepare

AI should not silently finalize compliance-sensitive accounting or tax decisions. Accountant/user approval is required for risky areas.

## Latest upgrade: firm-controlled accounting, reports, and exports

This version adds:

- Firm account library (`/account-library`)
- Client account-head approval requests
- Default firm accounts copied to new clients
- Client selection safeguards for accounting pages
- Report Builder with date/head filters
- Permission-controlled exports
- Export approval requests
- Export audit logs
- Cash/bank, tax summary, account usage, monthly closing report scaffolding

Because the Prisma schema changed, reset local development DB after pulling/unzipping this build:

```bash
docker compose down -v
docker compose up -d
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

After login, start from:

```txt
http://localhost:3000/firm
```

Then add your first real client company. No sample clients are seeded.
