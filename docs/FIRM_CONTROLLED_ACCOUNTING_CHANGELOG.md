# Firm-Controlled Accounting Upgrade

This build implements the planned firm/client accounting product direction.

## Implemented in this upgrade

### Firm and client control
- Firm dashboard remains the default landing page.
- One firm workspace manages client companies.
- Starter plan still uses 10 client slots.
- Accounting pages now show a helpful empty state when no client is selected.
- Client switcher now clearly shows “No client selected”.

### Firm account library
- Added firm-level account templates in the database.
- Seed creates a firm default chart/account library.
- New client creation copies firm default accounts into that client chart.
- Added `/account-library` UI page to view and extend the firm account library.
- Added repair/import action to copy default firm accounts into selected client if missing.

### Account head approval
- Client users no longer directly create account heads.
- Client account creation requests now create pending `AccountHeadRequest` records.
- Firm users can approve or reject requests from Account Library page.
- AI account-head creation goes through the same approval flow for client users.
- Duplicate/similar account detection added before account creation/request.

### Reports and exports
- Added Report Builder UI with date filters and specific account-head filters.
- Added backend report preview/export/request-export endpoints.
- Added report permission model per client.
- Export actions are permission-gated.
- Client users without export permission can request export approval from firm.
- Export logs capture report type, format, date range, selected heads, filters, user, and client.
- Export formats in this MVP:
  - Excel-compatible CSV
  - Word-readable DOC/HTML
  - PDF-ready HTML
  - JSON backup

### Additional reports/API scaffolding
- Debtors/receivables report
- Creditors/payables report
- Cash & bank report
- Tax summary report with safety note
- Account head usage report
- Monthly closing report
- Existing P&L/trial balance/balance sheet/general ledger retained

### UI polish
- Sidebar navigation for desktop.
- Top client switcher.
- Emerald/navy/gold-inspired visual direction.
- Better empty states.
- Added Account Library and improved Report Builder page.

## Important notes
- PDF export currently returns PDF-ready HTML that can be printed/saved as PDF. A true PDF renderer can be added later with Puppeteer or Playwright.
- Excel export currently returns CSV-compatible output. True XLSX can be added later with ExcelJS.
- DOCX export currently returns Word-readable `.doc` HTML. True DOCX can be added later with a DOCX generation library.
- Tax/compliance outputs remain preparation summaries only and require accountant review.
