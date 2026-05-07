# Multi-company + AI Accounting Upgrade

This upgrade changes the product from a single-business prototype into a firm-controlled SaaS MVP.

## Firm/client model

- Seed creates one firm workspace and one firm owner.
- No sample clients are created.
- Firm Starter plan includes 10 client company slots.
- Firm users can create real client companies from `/firm`.
- Client users can be invited per business and only see that business.

## Accounting expansion

Added practical heads for Pakistan SMEs:

- Cash in Hand
- Bank Account
- JazzCash / Easypaisa / Wallet
- Accounts Receivable
- Inventory / Stock placeholder
- Advance to Supplier
- Accounts Payable
- Customer Advances
- Tax heads for input/output sales tax and withholding tax
- Owner Capital and Owner Drawings
- Sales - Goods and Sales - Services
- Purchases
- Rent, salary, electricity, gas, internet/phone, transport, fuel, delivery, repairs, office, stationery, marketing, software, bank charges, professional fee, tea/refreshment, cleaning, donation, income tax, miscellaneous

## New accounting workflows

- Sale
- Purchase
- Expense
- Customer payment received
- Supplier payment made
- Manual journal entry
- Ledgers by account
- Trial balance
- Profit & loss
- Balance sheet API
- Missing document report

## AI workflows

AI can now suggest and prepare, but not silently change sensitive accounting data.

- AI transaction parsing
- AI account-head suggestion
- AI action queue
- Approve AI-created account heads
- AI report analysis
- AI monthly client review
- AI missing document request draft

## Receipt flow

The document vault supports bad handwriting and unclear OCR:

1. Upload receipt image/PDF/text.
2. OCR/AI attempts extraction.
3. User manually corrects vendor, amount, date, category, payment method, and expense/purchase type.
4. User approves as expense or purchase.
5. Receipt remains linked to the posted transaction.

## Safety principle

AI assists. Accountant/user approves. Tax/compliance-sensitive items should be marked for accountant review.
