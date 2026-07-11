'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { ClientRequired } from '@/components/ClientRequired';
import { Button, Card, Input, Select } from '@/components/Card';
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
  warning?: string;
};

const reportTypes = [
  ['profit-loss', 'Profit & Loss'],
  ['balance-sheet', 'Balance Sheet / Statement of Financial Position'],
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
  return new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function money(value: any) {
  if (typeof value !== 'number') return value || '-';

  return value.toLocaleString('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function isNumberValue(value: any) {
  return typeof value === 'number';
}

export default function ReportsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [preview, setPreview] = useState<ReportPreview | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [requestingExport, setRequestingExport] = useState(false);

  const [filters, setFilters] = useState({
    reportType: 'profit-loss',
    startDate: defaultStartDate(),
    endDate: todayDate(),
    accountId: '',
    accountCodes: [] as string[],
    includeZeroBalances: false,
    showMovementColumns: true,
    missingDocumentsOnly: false,
    format: 'preview',
  });

  const needsAccount = filters.reportType === 'general-ledger';

  const selectedReportLabel = useMemo(() => {
    return reportTypes.find(([value]) => value === filters.reportType)?.[1] || 'Report';
  }, [filters.reportType]);

  async function loadAccounts() {
    const businessId = getBusinessId();

    if (!businessId) return;

    setError('');

    try {
      const data = await api<Account[]>(`/accounting/businesses/${businessId}/accounts`);
      setAccounts(data || []);

      if (data?.length && !filters.accountId) {
        setFilters((current) => ({
          ...current,
          accountId: data[0].id,
        }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load accounts');
    } finally {
      setLoadingAccounts(false);
    }
  }

  useEffect(() => {
    loadAccounts();
  }, []);

  async function previewReport(e?: FormEvent) {
    e?.preventDefault();

    if (loadingPreview) return;

    const businessId = getBusinessId();

    if (!businessId) return;

    setMessage('');
    setError('');
    setLoadingPreview(true);

    try {
      const data = await api<ReportPreview>(`/accounting/businesses/${businessId}/reporting/preview`, {
        method: 'POST',
        body: JSON.stringify(filters),
      });

      setPreview(data);
      setMessage('Report preview generated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate report preview');
    } finally {
      setLoadingPreview(false);
    }
  }

  async function exportReport() {
    if (exporting) return;

    const businessId = getBusinessId();

    if (!businessId) return;

    setMessage('');
    setError('');
    setExporting(true);

    try {
      const result = await api<ExportResponse>(`/accounting/businesses/${businessId}/reporting/export`, {
        method: 'POST',
        body: JSON.stringify({
          ...filters,
          format: 'csv',
        }),
      });

      downloadBase64File(result.filename, result.mimeType, result.contentBase64);
      setMessage(result.warning || 'Report exported.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not export report');
    } finally {
      setExporting(false);
    }
  }

  async function requestExport() {
    if (requestingExport) return;

    const businessId = getBusinessId();

    if (!businessId) return;

    setMessage('');
    setError('');
    setRequestingExport(true);

    try {
      await api(`/accounting/businesses/${businessId}/reporting/request-export`, {
        method: 'POST',
        body: JSON.stringify({
          ...filters,
          format: 'csv',
          reason: 'Client requested report from Report Builder.',
        }),
      });

      setMessage('Report export request sent to firm for approval.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not request export approval');
    } finally {
      setRequestingExport(false);
    }
  }

  function toggleAccount(code: string) {
    setFilters((current) => ({
      ...current,
      accountCodes: current.accountCodes.includes(code)
        ? current.accountCodes.filter((item) => item !== code)
        : [...current.accountCodes, code],
    }));
  }

  return (
    <AppShell>
      <ClientRequired title="Select a client to open Report Builder">
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
          <div className="rounded-3xl bg-slate-950 p-6 text-white shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
              Report builder
            </p>
            <h1 className="mt-2 text-3xl font-bold">Reports</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">
              Build reports with proper start and end dates. Balance Sheet uses the end date as
              the as-of date, while still respecting the selected start date.
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

          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.5fr]">
            <Card>
              <h2 className="text-xl font-bold text-slate-900">Filters</h2>
              <p className="mt-1 text-sm text-slate-500">
                All reports use both a start date and an end date.
              </p>

              <form onSubmit={previewReport} className="mt-5 space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Report type
                  </label>
                  <Select
                    value={filters.reportType}
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        reportType: e.target.value,
                      })
                    }
                  >
                    {reportTypes.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Start date
                    </label>
                    <Input
                      type="date"
                      value={filters.startDate}
                      onChange={(e) =>
                        setFilters({
                          ...filters,
                          startDate: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      End date / As-of date
                    </label>
                    <Input
                      type="date"
                      value={filters.endDate}
                      onChange={(e) =>
                        setFilters({
                          ...filters,
                          endDate: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                {filters.reportType === 'balance-sheet' && (
                  <div className="rounded-2xl bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
                    For Balance Sheet, the end date is the as-of date. The start date controls the
                    calculation base and period movement.
                  </div>
                )}

                {filters.reportType === 'trial-balance' && (
                  <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-800">
                    Trial Balance shows opening balances, period movement, and closing balances
                    between the selected dates.
                  </div>
                )}

                {needsAccount && (
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Account for General Ledger
                    </label>
                    <Select
                      value={filters.accountId}
                      onChange={(e) =>
                        setFilters({
                          ...filters,
                          accountId: e.target.value,
                        })
                      }
                      disabled={loadingAccounts || !accounts.length}
                    >
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.code} — {account.name} ({account.type})
                        </option>
                      ))}
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={filters.includeZeroBalances}
                      onChange={(e) =>
                        setFilters({
                          ...filters,
                          includeZeroBalances: e.target.checked,
                        })
                      }
                    />
                    Include zero-balance accounts
                  </label>

                  <label className="flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={filters.missingDocumentsOnly}
                      onChange={(e) =>
                        setFilters({
                          ...filters,
                          missingDocumentsOnly: e.target.checked,
                        })
                      }
                    />
                    Missing documents only
                  </label>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Specific heads optional
                  </p>

                  <div className="max-h-48 space-y-2 overflow-y-auto rounded-2xl border border-slate-200 p-3">
                    {accounts.map((account) => (
                      <label
                        key={account.id}
                        className="flex items-start gap-2 text-xs text-slate-700"
                      >
                        <input
                          type="checkbox"
                          checked={filters.accountCodes.includes(account.code)}
                          onChange={() => toggleAccount(account.code)}
                          className="mt-0.5"
                        />
                        <span>
                          <b>{account.code}</b> — {account.name}
                        </span>
                      </label>
                    ))}

                    {!accounts.length && (
                      <p className="text-xs text-slate-500">No accounts loaded yet.</p>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <Button
                    type="submit"
                    disabled={loadingPreview}
                    className="disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loadingPreview ? 'Previewing...' : 'Preview'}
                  </Button>

                  <button
                    type="button"
                    onClick={exportReport}
                    disabled={exporting}
                    className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {exporting ? 'Exporting...' : 'Export CSV'}
                  </button>

                  <button
                    type="button"
                    onClick={requestExport}
                    disabled={requestingExport}
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {requestingExport ? 'Requesting...' : 'Request Approval'}
                  </button>
                </div>
              </form>
            </Card>

            <div className="space-y-6">
              {!preview && (
                <Card>
                  <h2 className="text-xl font-bold text-slate-900">Preview</h2>
                  <p className="mt-2 text-sm text-slate-500">
                    Select filters and click Preview. The report will appear as spreadsheet-style
                    tables here instead of JSON.
                  </p>
                </Card>
              )}

              {preview && (
                <ReportPreviewCard preview={preview} selectedReportLabel={selectedReportLabel} />
              )}
            </div>
          </div>
        </div>
      </ClientRequired>
    </AppShell>
  );
}

function ReportPreviewCard({
  preview,
  selectedReportLabel,
}: {
  preview: ReportPreview;
  selectedReportLabel: string;
}) {
  return (
    <Card>
      <div className="mb-5 border-b border-slate-200 pb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
          {selectedReportLabel}
        </p>
        <h2 className="mt-1 text-2xl font-bold text-slate-900">{preview.title}</h2>
        <p className="mt-1 text-sm font-semibold text-slate-700">{preview.clientName}</p>
        <p className="mt-1 text-sm text-slate-500">{preview.subtitle}</p>
        <p className="mt-1 text-xs text-slate-400">
          Generated {preview.generatedAt} • {preview.timezone}
        </p>
      </div>

      <div className="space-y-8">
        {preview.sections.map((section) => (
          <div key={section.title}>
            <h3 className="mb-3 text-lg font-bold text-slate-900">{section.title}</h3>

            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    {section.columns.map((column) => (
                      <th
                        key={column.key}
                        className={`px-4 py-3 ${
                          column.align === 'right' ? 'text-right' : 'text-left'
                        }`}
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
                            column.align === 'right' || isNumberValue(row[column.key])
                              ? 'text-right font-medium'
                              : 'text-left'
                          }`}
                        >
                          {money(row[column.key])}
                        </td>
                      ))}
                    </tr>
                  ))}

                  {!section.rows.length && (
                    <tr>
                      <td
                        colSpan={section.columns.length}
                        className="px-4 py-8 text-center text-sm text-slate-500"
                      >
                        No rows for this report and date range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {section.totals && (
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                {Object.entries(section.totals).map(([key, value]) => (
                  <div key={key} className="rounded-2xl bg-slate-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {key.replace(/([A-Z])/g, ' $1')}
                    </p>
                    <p className="mt-1 text-lg font-bold text-slate-900">{money(value)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
