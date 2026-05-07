# AI + OCR Setup

This version replaces the original rule-only parser with a provider-agnostic AI layer and adds OCR processing for uploaded receipts.

## AI providers

The API supports these providers without provider SDK packages:

- `mock` - local fallback parser, no external API key
- `openai` - OpenAI Chat Completions API
- `anthropic` - Anthropic Messages API
- `gemini` - Google Gemini generateContent API

Set one of these in `apps/api/.env`:

```env
AI_PROVIDER="openai"
OPENAI_API_KEY="sk-..."
OPENAI_MODEL="gpt-4o-mini"
```

Or:

```env
AI_PROVIDER="anthropic"
ANTHROPIC_API_KEY="sk-ant-..."
ANTHROPIC_MODEL="claude-3-5-haiku-latest"
```

Or:

```env
AI_PROVIDER="gemini"
GEMINI_API_KEY="..."
GEMINI_MODEL="gemini-1.5-flash"
```

If keys are missing, the app safely falls back to the local rule parser.

## OCR providers

The API supports:

- `mock` - safe placeholder text for local development; it does not pretend to read real receipt amounts, so use manual overrides when testing approval
- `google-vision` - calls Google Vision REST API with `GOOGLE_VISION_API_KEY`
- `tesseract` - calls a locally installed `tesseract` CLI

Google Vision example:

```env
OCR_PROVIDER="google-vision"
GOOGLE_VISION_API_KEY="..."
```

Tesseract example:

```env
OCR_PROVIDER="tesseract"
TESSERACT_BIN="tesseract"
TESSERACT_LANG="eng+urd"
```

On Ubuntu, install Tesseract with:

```bash
sudo apt update
sudo apt install -y tesseract-ocr tesseract-ocr-eng tesseract-ocr-urd
```

## New backend flow

1. Upload receipt:

```http
POST /documents/businesses/:businessId/upload?documentType=RECEIPT&process=true
```

2. Re-run OCR manually:

```http
POST /documents/businesses/:businessId/:documentId/process-ocr
```

3. Read latest OCR job:

```http
GET /documents/businesses/:businessId/:documentId/ocr
```

4. Approve extracted receipt as expense:

```http
POST /documents/businesses/:businessId/:documentId/approve-as-expense
```

Optional body:

```json
{
  "amount": 18450,
  "category": "utilities",
  "paymentMethod": "bank",
  "vendorName": "K-Electric",
  "date": "2026-05-05"
}
```

## Safety design

- AI never auto-posts entries without confirmation.
- OCR creates extracted suggestions first.
- The user/accountant must approve a receipt before it becomes an expense.
- Duplicate invoice/receipt risk is flagged before posting.
- Tax/compliance-sensitive receipts are marked for accountant review.
