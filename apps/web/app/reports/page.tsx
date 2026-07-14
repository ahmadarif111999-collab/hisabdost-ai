'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { ClientRequired } from '@/components/ClientRequired';
import { Card, Input } from '@/components/Card';
import { api, downloadBase64File, getBusinessId } from '@/lib/api';

type Account = {
  id: string;
  code: string;
  name: string;
  type: string;
};

type PreviewColumn = {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
};

type PreviewSection = {
  title: string;
  columns: PreviewColumn[];
  rows: Record<string, any>[];
  totals?: Record<string, any>;
  note?: string;
};

type ReportPreview = {
  reportType: string;
  title: string;
  subtitle: string;
  clientName: string;
  generatedAt: string;
  timezone: string;
  filters: Record<string, any>;
  sections: PreviewSection[];
};

type ExportResponse = {
  filename: string;
  mimeType: string;
  contentBase64: string;
  message?: string;
};

const reportTypes = [
  ['profit-loss', 'Profit & Loss'],
  ['balance-sheet', 'Balance Sheet'],
  ['trial-balance', 'Trial Balance'],
  ['general-ledger', 'General Ledger'],
  ['sales', 'Sales Report'],
  ['purchases', 'Purchase Report'],
  ['expenses', 'Expense Report'],
  ['cash-bank', 'Cash & Bank Report'],
  ['tax-summary', 'Tax Summary'],
  ['missing-documents', 'Missing Documents'],
];

function defaultStartDate() {
  const today = new Date();
  const year = today.getMonth() + 1 >= 7 ? today.getFullYear() : today.getFullYear() - 1;
  return `${year}-07-01`;
}

function defaultEndDate() {
  return new Date().toISOString().slice(0, 10);
}

function money(value: any) {
  const amount = Number(value || 0);

  if (Number.isNaN(amount)) return String(value || '-');

  if (amount < 0) {
    return `(${Math.abs(amount).toLocaleString('en-PK', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })})`;
  }

  return amount.toLocaleString('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatCell(value: any) {
  if (typeof value === 'number') return money(value);
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

export default function ReportsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [preview, setPreview] = useState<ReportPreview | null>(null);
  const [reportType, setReportType] = useState('profit-loss');
  const [startDate, setStartDate] = useState(defaultStartDate());
  const [endDate, setEndDate] = useState(defaultEndDate());
  const [accountId, setAccountId] = useState('');
  const [includeZeroBalances, setIncludeZeroBalances] = useState(false);
  const [missingDocumentsOnly, setMissingDocumentsOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const filters = {
    reportType,
    startDate,
    endDate,
    accountId,
    accountCode: '',
    accountCodes: [],
    includeZeroBalances,
    showMovementColumns: true,
    missingDocumentsOnly,
    format: 'xlsx',
  };

  async function loadAccounts() {
    const businessId = getBusinessId();

    if (!businessId) return;

    try {
      const result = await api<Account[]>(`/accounting/businesses/${businessId}/accounts`);
      setAccounts(result);

      if (!accountId && result.length) {
        setAccountId(result[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load accounts');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAccounts();
  }, []);

  async function previewReport(e?: FormEvent) {
    e?.preventDefault();

    if (previewing) return;

    const businessId = getBusinessId();

    if (!businessId) return;

    setMessage('');
    setError('');
    setPreviewing(true);

    try {
      const result = await api<ReportPreview>(
        `/accounting/businesses/${businessId}/reporting/preview`,
        {
          method: 'POST',
          body: JSON.stringify(filters),
        },
      );

      setPreview(result);
      setMessage('Report preview generated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not preview report');
    } finally {
      setPreviewing(false);
    }
  }

  async function exportXlsx() {
    if (exporting) return;

    const businessId = getBusinessId();

    if (!businessId) return;

    setMessage('');
    setError('');
    setExporting(true);

    try {
      const result = await api<ExportResponse>(
        `/accounting/businesses/${businessId}/xlsx/reports`,
        {
          method: 'POST',
          body: JSON.stringify(filters),
        },
      );

      downloadBase64File(result.filename, result.mimeType, result.contentBase64);
      setMessage(result.message || 'XLSX report exported.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not export XLSX report');
    } finally {
      setExporting(false);
    }
  }

  async function requestExport() {
    if (requesting) return;

    const businessId = getBusinessId();

    if (!businessId) return;

    setMessage('');
    setError('');
    setRequesting(true);

    try {
      await api(`/accounting/businesses/${businessId}/reporting/request-export`, {
        method: 'POST',
        body: JSON.stringify({
          ...filters,
          reason: 'Client requested XLSX report from Report Builder.',
        }),
      });

      setMessage('Report export request sent to firm for approval.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not request export approval');
    } finally {
      setRequesting(false);
    }
  }

  return (
    <AppShell>
      <ClientRequired title="Select a client to use report builder">
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
          <div className="rounded-3xl bg-slate-950 p-6 text-white shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
              Report builder
            </p>
            <h1 className="mt-2 text-3xl font-bold">Reports & XLSX Export</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">
              Preview accounting reports and export clean Excel-compatible XLSX files with headers,
              sections, totals, client name, period, and Pakistan timezone.
            </p>
          </div>

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {message && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {message}
            </div>
          )}

          <Card>
            <form
              onSubmit={previewReport}
              className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_1fr] lg:items-end"
            >
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Report type
                </label>
                <select
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-500"
                >
                  {reportTypes.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Start date
                </label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  End date
                </label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>

              <button
                type="submit"
                disabled={previewing}
                className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {previewing ? 'Previewing...' : 'Preview'}
              </button>
            </form>

            <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr_1fr]">
              <label className="flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={includeZeroBalances}
                  onChange={(e) => setIncludeZeroBalances(e.target.checked)}
                />
                Include zero balances
              </label>

              <label className="flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={missingDocumentsOnly}
                  onChange={(e) => setMissingDocumentsOnly(e.target.checked)}
                />
                Missing documents only
              </label>

              {reportType === 'general-ledger' && (
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-500"
                >
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.code} — {account.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={exportXlsx}
                disabled={exporting}
                className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {exporting ? 'Exporting...' : 'Export XLSX'}
              </button>

              <button
                type="button"
                onClick={requestExport}
                disabled={requesting}
                className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {requesting ? 'Requesting...' : 'Request Export Approval'}
              </button>
            </div>
          </Card>

          {loading && (
            <Card>
              <p className="text-sm text-slate-600">Loading accounts...</p>
            </Card>
          )}

          {preview && <ReportPreviewCard preview={preview} />}
        </div>
      </ClientRequired>
    </AppShell>
  );
}

function ReportPreviewCard({ preview }: { preview: ReportPreview }) {
  return (
    <Card>
      <div className="border-b border-slate-200 pb-4">
        <h2 className="text-2xl font-bold text-slate-900">{preview.title}</h2>
        <p className="mt-1 text-sm text-slate-500">{preview.subtitle}</p>
        <p className="mt-1 text-xs text-slate-400">
          Client: {preview.clientName} • Generated: {preview.generatedAt} • {preview.timezone}
        </p>
      </div>

      <div className="mt-6 space-y-8">
        {preview.sections.map((section) => (
          <SectionTable key={section.title} section={section} />
        ))}
      </div>
    </Card>
  );
}

function SectionTable({ section }: { section: PreviewSection }) {
  return (
    <div>
      <h3 className="mb-3 text-lg font-bold text-slate-900">{section.title}</h3>

      {section.note && (
        <div className="mb-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          {section.note}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {section.columns.map((column) => (
                <th
                  key={column.key}
                  className={`px-4 py-3 ${column.align === 'right' ? 'text-right' : ''}`}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {section.rows.map((row, index) => (
              <tr key={index} className="bg-white">
                {section.columns.map((column) => (
                  <td
                    key={column.key}
                    className={`px-4 py-3 ${
                      column.align === 'right' ? 'text-right font-mono' : 'text-slate-700'
                    }`}
                  >
                    {formatCell(row[column.key])}
                  </td>
                ))}
              </tr>
            ))}

            {!section.rows.length && (
              <tr>
                <td colSpan={section.columns.length} className="px-4 py-6 text-center text-slate-500">
                  No rows for this section.
                </td>
              </tr>
            )}
          </tbody>

          {section.totals && (
            <tfoot className="bg-slate-50 text-sm font-bold text-slate-900">
              {Object.entries(section.totals).map(([key, value]) => (
                <tr key={key}>
                  <td className="px-4 py-3" colSpan={Math.max(section.columns.length - 1, 1)}>
                    {key.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase())}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{formatCell(value)}</td>
                </tr>
              ))}
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
