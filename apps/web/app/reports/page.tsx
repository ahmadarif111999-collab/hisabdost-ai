'use client';

import {
  type ComponentType,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import * as AppShellModule from '../../components/AppShell';
import * as ClientRequiredModule from '../../components/ClientRequired';
import * as ApiModule from '../../lib/api';

const AppShell = ((AppShellModule as any).default ||
  (AppShellModule as any).AppShell) as ComponentType<{
  children: ReactNode;
}>;
const ClientRequired = ((ClientRequiredModule as any).default ||
  (ClientRequiredModule as any).ClientRequired) as ComponentType<{
  children: ReactNode;
}>;
const apiFetch = ((ApiModule as any).apiFetch ||
  (ApiModule as any).default) as (
  path: string,
  options?: RequestInit,
) => Promise<any>;

type ReportType =
  | 'profit-loss'
  | 'balance-sheet'
  | 'trial-balance'
  | 'general-ledger'
  | 'sales'
  | 'purchases'
  | 'expenses'
  | 'cash-bank'
  | 'tax-summary'
  | 'missing-documents';

type ReportRow = Record<string, any>;

type ReportSection = {
  title?: string;
  columns?: string[];
  rows?: ReportRow[];
  totals?: Record<string, any>;
};

type ReportPreview = {
  title?: string;
  subtitle?: string;
  generatedAt?: string;
  sections?: ReportSection[];
};

type AccountOption = {
  id: string;
  name: string;
  code?: string;
};

const REPORT_OPTIONS: Array<{
  value: ReportType;
  label: string;
  description: string;
}> = [
  {
    value: 'profit-loss',
    label: 'Profit & Loss',
    description: 'Income, expenses, and profit for the selected period.',
  },
  {
    value: 'balance-sheet',
    label: 'Balance Sheet',
    description: 'Assets, liabilities, and equity as of the end date.',
  },
  {
    value: 'trial-balance',
    label: 'Trial Balance',
    description: 'Account balances with debit and credit totals.',
  },
  {
    value: 'general-ledger',
    label: 'General Ledger',
    description: 'Detailed account activity with permanent JE references.',
  },
  {
    value: 'sales',
    label: 'Sales Register',
    description: 'Invoices with permanent INV references.',
  },
  {
    value: 'purchases',
    label: 'Purchase Register',
    description: 'Purchases with PUR, JE, and DOC references.',
  },
  {
    value: 'expenses',
    label: 'Expense Register',
    description: 'Expenses with EXP, JE, and DOC references.',
  },
  {
    value: 'cash-bank',
    label: 'Cash & Bank',
    description: 'Balances and the REC/PAY payment register.',
  },
  {
    value: 'tax-summary',
    label: 'Tax Summary',
    description: 'Tax-sensitive account totals for the selected period.',
  },
  {
    value: 'missing-documents',
    label: 'Missing Documents',
    description: 'Transactions still requiring a receipt or document.',
  },
];

function localDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function resolveBusinessId() {
  if (typeof window === 'undefined') return '';
  const directKeys = [
    'activeBusinessId',
    'selectedBusinessId',
    'businessId',
    'activeClientId',
  ];
  for (const key of directKeys) {
    const value = window.localStorage.getItem(key);
    if (value) return value;
  }

  const objectKeys = ['activeBusiness', 'selectedBusiness', 'activeClient'];
  for (const key of objectKeys) {
    const value = window.localStorage.getItem(key);
    if (!value) continue;
    try {
      const parsed = JSON.parse(value);
      if (parsed?.id) return String(parsed.id);
      if (parsed?.businessId) return String(parsed.businessId);
    } catch {
      // Ignore invalid legacy values.
    }
  }
  return '';
}

function normalizedError(error: unknown) {
  if (error instanceof Error) return error.message;
  return 'The request could not be completed.';
}

function triggerDownload(base64: string, filename: string, mimeType: string) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const blob = new Blob([bytes], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

function humanize(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayValue(column: string, value: any) {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'number') {
    const financialColumn = /amount|debit|credit|balance|tax|total|received|paid|profit|loss|income|expense/i.test(
      column,
    );
    return financialColumn
      ? value.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : value.toLocaleString('en-US');
  }
  return String(value);
}

export default function ReportsPage() {
  const today = useMemo(() => new Date(), []);
  const [businessId, setBusinessId] = useState('');
  const [reportType, setReportType] = useState<ReportType>('profit-loss');
  const [startDate, setStartDate] = useState(
    localDate(new Date(today.getFullYear(), 0, 1)),
  );
  const [endDate, setEndDate] = useState(localDate(today));
  const [accountId, setAccountId] = useState('');
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [preview, setPreview] = useState<ReportPreview | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const updateBusiness = (event?: Event) => {
      const custom = event as CustomEvent<any> | undefined;
      const eventBusinessId =
        custom?.detail?.businessId || custom?.detail?.id || '';
      setBusinessId(String(eventBusinessId || resolveBusinessId()));
    };

    updateBusiness();
    window.addEventListener('storage', updateBusiness);
    window.addEventListener('businessChanged', updateBusiness);
    window.addEventListener('activeBusinessChanged', updateBusiness);
    window.addEventListener('clientChanged', updateBusiness);
    return () => {
      window.removeEventListener('storage', updateBusiness);
      window.removeEventListener('businessChanged', updateBusiness);
      window.removeEventListener('activeBusinessChanged', updateBusiness);
      window.removeEventListener('clientChanged', updateBusiness);
    };
  }, []);

  useEffect(() => {
    if (!businessId) {
      setAccounts([]);
      return;
    }

    let cancelled = false;
    apiFetch(`/accounting/businesses/${businessId}/accounts`)
      .then((response) => {
        if (cancelled) return;
        const records = Array.isArray(response)
          ? response
          : response?.accounts || response?.items || [];
        setAccounts(
          records
            .filter((record: any) => record?.id)
            .map((record: any) => ({
              id: String(record.id),
              name:
                record.name ||
                record.accountName ||
                record.displayName ||
                'Unnamed account',
              code: record.code || record.accountCode || undefined,
            })),
        );
      })
      .catch(() => {
        if (!cancelled) setAccounts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  useEffect(() => {
    setPreview(null);
    setSearch('');
    setError('');
    setMessage('');
    if (reportType !== 'general-ledger') setAccountId('');
  }, [reportType, businessId]);

  const requestBody = useCallback(() => {
    const selectedAccount = accounts.find((account) => account.id === accountId);
    return {
      reportType,
      startDate,
      endDate,
      asOfDate: endDate,
      ...(accountId
        ? {
            accountId,
            accountName: selectedAccount
              ? `${selectedAccount.code ? `${selectedAccount.code} — ` : ''}${selectedAccount.name}`
              : 'Selected account',
          }
        : {}),
    };
  }, [accountId, accounts, endDate, reportType, startDate]);

  const generatePreview = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const result = await apiFetch(
        `/accounting/businesses/${businessId}/reporting/preview`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody()),
        },
      );
      setPreview(result);
      setMessage('Report preview generated with permanent references.');
    } catch (requestError) {
      setPreview(null);
      setError(normalizedError(requestError));
    } finally {
      setLoading(false);
    }
  }, [businessId, requestBody]);

  const exportXlsx = useCallback(async () => {
    if (!businessId) return;
    setExporting(true);
    setError('');
    setMessage('');
    try {
      const result = await apiFetch(
        `/accounting/businesses/${businessId}/xlsx/report`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody()),
        },
      );
      const base64 =
        result?.base64 || result?.contentBase64 || result?.fileBase64;
      if (!base64 || !result?.filename) {
        throw new Error('The export response did not include a file.');
      }
      triggerDownload(
        base64,
        result.filename,
        result.mimeType ||
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      setMessage(
        result.message ||
          `${result.exportNo || result.referenceNo || 'Export'} downloaded successfully.`,
      );
    } catch (requestError) {
      setError(normalizedError(requestError));
    } finally {
      setExporting(false);
    }
  }, [businessId, requestBody]);

  const requestExport = useCallback(async () => {
    if (!businessId) return;
    setRequesting(true);
    setError('');
    setMessage('');
    try {
      const result = await apiFetch(
        `/accounting/businesses/${businessId}/reporting/request-export`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody()),
        },
      );
      const requestNo =
        result?.requestNo ||
        result?.referenceNo ||
        result?.request?.requestNo ||
        result?.request?.referenceNo;
      setMessage(
        result?.message ||
          `${requestNo || 'Report export request'} submitted for firm approval.`,
      );
    } catch (requestError) {
      setError(normalizedError(requestError));
    } finally {
      setRequesting(false);
    }
  }, [businessId, requestBody]);

  const filteredSections = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (preview?.sections || []).map((section) => {
      const rows = section.rows || [];
      if (!query) return { ...section, rows };
      return {
        ...section,
        rows: rows.filter((row) =>
          Object.values(row).some((value) =>
            String(
              typeof value === 'object' && value !== null
                ? JSON.stringify(value)
                : value ?? '',
            )
              .toLowerCase()
              .includes(query),
          ),
        ),
      };
    });
  }, [preview, search]);

  const selectedOption = REPORT_OPTIONS.find(
    (option) => option.value === reportType,
  );

  return (
    <AppShell>
      <ClientRequired>
        <main className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Accounting reports
                </p>
                <h1 className="mt-1 text-2xl font-bold text-slate-950">
                  Reports and permanent references
                </h1>
                <p className="mt-2 max-w-3xl text-sm text-slate-600">
                  Preview reports, search EXP/PUR/REC/PAY references, download an
                  EX-numbered workbook, or submit an RPT-numbered approval request.
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <span className="font-semibold text-slate-900">Selected:</span>{' '}
                {selectedOption?.label}
              </div>
            </div>
          </section>

          <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2 xl:grid-cols-5">
            <label className="space-y-2 xl:col-span-2">
              <span className="text-sm font-semibold text-slate-800">Report</span>
              <select
                value={reportType}
                onChange={(event) =>
                  setReportType(event.target.value as ReportType)
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none ring-blue-500 focus:ring-2"
              >
                {REPORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">
                {selectedOption?.description}
              </p>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-800">
                Start date
              </span>
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-blue-500 focus:ring-2"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-800">
                End / as-of date
              </span>
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-blue-500 focus:ring-2"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-800">
                Ledger account
              </span>
              <select
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
                disabled={reportType !== 'general-ledger'}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none ring-blue-500 disabled:bg-slate-100 disabled:text-slate-400 focus:ring-2"
              >
                <option value="">All / select account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.code ? `${account.code} — ` : ''}
                    {account.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-wrap gap-3 md:col-span-2 xl:col-span-5">
              <button
                type="button"
                onClick={generatePreview}
                disabled={!businessId || loading}
                className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? 'Generating…' : 'Generate preview'}
              </button>
              <button
                type="button"
                onClick={exportXlsx}
                disabled={!businessId || exporting}
                className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {exporting ? 'Preparing XLSX…' : 'Download XLSX'}
              </button>
              <button
                type="button"
                onClick={requestExport}
                disabled={!businessId || requesting}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {requesting ? 'Submitting…' : 'Request approved export'}
              </button>
            </div>
          </section>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          ) : null}
          {message ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {message}
            </div>
          ) : null}

          {preview ? (
            <section className="space-y-5">
              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-950">
                    {preview.title || selectedOption?.label}
                  </h2>
                  {preview.subtitle ? (
                    <p className="mt-1 text-sm text-slate-600">
                      {preview.subtitle}
                    </p>
                  ) : null}
                </div>
                <label className="w-full md:max-w-md">
                  <span className="sr-only">Search report rows</span>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search EXP, PUR, JE, REC, PAY, DOC, name…"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-blue-500 focus:ring-2"
                  />
                </label>
              </div>

              {filteredSections.map((section, sectionIndex) => {
                const rows = section.rows || [];
                const columns =
                  section.columns?.length
                    ? section.columns
                    : rows[0]
                      ? Object.keys(rows[0])
                      : [];
                return (
                  <article
                    key={`${section.title || 'section'}-${sectionIndex}`}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                  >
                    <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                      <h3 className="font-bold text-slate-950">
                        {section.title || `Section ${sectionIndex + 1}`}
                      </h3>
                      <span className="text-xs font-medium text-slate-500">
                        {rows.length.toLocaleString('en-US')} row
                        {rows.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-slate-200 text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            {columns.map((column) => (
                              <th
                                key={column}
                                className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600"
                              >
                                {humanize(column)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {rows.length ? (
                            rows.map((row, rowIndex) => (
                              <tr key={rowIndex} className="hover:bg-slate-50/70">
                                {columns.map((column) => (
                                  <td
                                    key={column}
                                    className="max-w-[340px] whitespace-nowrap px-4 py-3 text-slate-700"
                                  >
                                    {displayValue(column, row[column])}
                                  </td>
                                ))}
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td
                                colSpan={Math.max(columns.length, 1)}
                                className="px-4 py-10 text-center text-slate-500"
                              >
                                No rows match the selected filters or search.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    {section.totals && Object.keys(section.totals).length ? (
                      <div className="flex flex-wrap gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
                        {Object.entries(section.totals).map(([label, value]) => (
                          <div
                            key={label}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2"
                          >
                            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                              {humanize(label)}
                            </p>
                            <p className="mt-1 font-semibold text-slate-950">
                              {displayValue(label, value)}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </section>
          ) : (
            <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center text-sm text-slate-500">
              Generate a preview to view readable accounting references.
            </section>
          )}
        </main>
      </ClientRequired>
    </AppShell>
  );
}
