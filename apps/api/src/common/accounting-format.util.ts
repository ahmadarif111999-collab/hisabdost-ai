export const PAKISTAN_TIME_ZONE = 'Asia/Karachi';

export function formatPakistanDate(value?: Date | string | null) {
  if (!value) return '-';

  return new Date(value).toLocaleDateString('en-PK', {
    timeZone: PAKISTAN_TIME_ZONE,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

export function formatPakistanDateTime(value?: Date | string | null) {
  if (!value) return '-';

  return new Date(value).toLocaleString('en-PK', {
    timeZone: PAKISTAN_TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function displayJournalEntryNo(date: Date | string, id: string) {
  const year = new Date(date).getFullYear();
  return `JE-${year}-${shortCode(id)}`;
}

export function displayReportNo(date: Date | string, id: string) {
  const year = new Date(date).getFullYear();
  return `RPT-${year}-${shortCode(id)}`;
}

export function displayPaymentNo(date: Date | string, id: string) {
  const year = new Date(date).getFullYear();
  return `PAY-${year}-${shortCode(id)}`;
}

export function shortCode(id?: string | null) {
  if (!id) return 'SYSTEM';

  return id.slice(-6).toUpperCase();
}

export function sourceTypeLabel(sourceType?: string | null) {
  const normalized = String(sourceType || '').toLowerCase();

  const labels: Record<string, string> = {
    manual: 'Manual journal',
    sale: 'Sale invoice',
    sales: 'Sale invoice',
    invoice: 'Sale invoice',
    purchase: 'Purchase',
    expense: 'Expense',
    payment: 'Payment',
    receipt: 'Receipt',
    opening_balance: 'Opening balance',
    closing_entry: 'Closing entry',
    system: 'System entry',
  };

  return labels[normalized] || titleCase(normalized.replace(/_/g, ' ') || 'Accounting entry');
}

export function cleanAccountingNarration(narration?: string | null, sourceType?: string | null) {
  const fallback = `${sourceTypeLabel(sourceType)} recorded.`;

  let text = String(narration || '').trim();

  if (!text) return fallback;

  text = text
    .replace(/\s+/g, ' ')
    .replace(/\b[a-z0-9]{20,}\b/gi, 'reference')
    .replace(/\bid[:\s-]*[a-z0-9-]+/gi, '')
    .replace(/createdbyid/gi, 'created by')
    .replace(/approvedbyid/gi, 'approved by')
    .replace(/businessid/gi, 'business')
    .replace(/sourceid/gi, 'source reference')
    .trim();

  if (!text) return fallback;

  text = text.charAt(0).toUpperCase() + text.slice(1);

  if (!/[.!?]$/.test(text)) {
    text += '.';
  }

  return text;
}

export function displayUserName(user?: { name?: string | null; email?: string | null } | null) {
  if (!user) return 'System';

  return user.name || user.email || 'System';
}

export function normalBalanceLabel(accountType: string, signedBalance: number) {
  if (!signedBalance) return 'Nil';

  const normalDebit = accountType === 'ASSET' || accountType === 'EXPENSE';

  if (normalDebit) {
    return signedBalance >= 0 ? 'Debit' : 'Credit';
  }

  return signedBalance >= 0 ? 'Credit' : 'Debit';
}

function titleCase(value: string) {
  return value
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
