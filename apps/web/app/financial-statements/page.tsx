'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { ClientRequired } from '@/components/ClientRequired';
import { Card, Input } from '@/components/Card';
import { api, downloadBase64File, getBusinessId } from '@/lib/api';

type StatementColumn = {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
};

type StatementSection = {
  title: string;
  columns: StatementColumn[];
  rows: Record<string, any>[];
  totals?: Record<string, any>;
  note?: string;
};

type Statement = {
  key: string;
  title: string;
  subtitle: string;
  sections: StatementSection[];
};

type FinancialStatementsPreview = {
  title: string;
  clientName: string;
  generatedAt: string;
  timezone: string;
  filters: {
    startDate: string;
    startDateDisplay: string;
    endDate: string;
    endDateDisplay: string;
    includeZeroBalances: boolean;
  };
  statements: Statement[];
};

type ExportResponse = {
  filename: string;
  mimeType: string;
  contentBase64: string;
  message?: string;
};

function defaultStartDate() {
  const today = new Date();
  const year = today.getMonth() + 1 >= 7 ? today.getFullYear() : today.getFullYear() - 1;
  return `${year}-07-01`;
}

function defaultEndDate() {
  return new Date().toISOString().slice(0, 10);
}

function money(value: number) {
  const amount = Number(value || 0);

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

export default function FinancialStatementsPage() {
  const [preview, setPreview] = useState<FinancialStatementsPreview | null>(null);
  const [startDate, setStartDate] = useState(defaultStartDate());
  const [endDate, setEndDate] = useState(defaultEndDate());
  const [includeZeroBalances, setIncludeZeroBalances] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const businessId = getBusinessId();

    if (!businessId) return;

    setError('');

    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
        includeZeroBalances: String(includeZeroBalances),
      });

      const result = await api<FinancialStatementsPreview>(
        `/accounting/businesses/${businessId}/financial-statements/preview?${params.toString()}`,
      );

      setPreview(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate financial statements');
    } finally {
      setLoading(false);
      setGenerating(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function generate(e: FormEvent) {
    e.preventDefault();

    if (generating) return;

    setMessage('');
    setGenerating(true);
    await load();
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
        `/accounting/businesses/${businessId}/xlsx/financial-statements`,
        {
          method: 'POST',
          body: JSON.stringify({
            startDate,
            endDate,
            includeZeroBalances,
          }),
        },
      );

      downloadBase64File(result.filename, result.mimeType, result.contentBase64);
      setMessage(result.message || 'Financial statements XLSX exported.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not export financial statements');
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <ClientRequired title="Select a client to view financial statements">
          <div className="mx-auto max-w-7xl px-4 py-8">
            <Card>
              <p className="text-sm text-slate-600">Generating financial statements...</p>
            </Card>
          </div>
        </ClientRequired>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <ClientRequired title="Select a client to view financial statements">
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
          <div className="rounded-3xl bg-slate-950 p-6 text-white shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
              IFRS-style financial statements
            </p>
            <h1 className="mt-2 text-3xl font-bold">Financial Statements</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">
              Generate and export the full financial statement pack: Statement of Financial
              Position, Profit or Loss, Cash Flows, Changes in Equity, and Notes.
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
            <form onSubmit={generate} className="grid gap-4 lg:grid-cols-[1fr_1fr_auto_auto_auto] lg:items-end">
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

              <label className="flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={includeZeroBalances}
                  onChange={(e) => setIncludeZeroBalances(e.target.checked)}
                />
                Include zero balances
              </label>

              <button
                type="submit"
                disabled={generating}
                className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {generating ? 'Generating...' : 'Generate'}
              </button>

              <button
                type="button"
                onClick={exportXlsx}
                disabled={exporting}
                className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {exporting ? 'Exporting...' : 'Export XLSX'}
              </button>
            </form>
          </Card>

          {preview && (
            <>
              <Card>
                <div className="grid gap-4 md:grid-cols-4">
                  <Metric label="Client" value={preview.clientName} />
                  <Metric label="From" value={preview.filters.startDateDisplay} />
                  <Metric label="To" value={preview.filters.endDateDisplay} />
                  <Metric label="Generated" value={preview.generatedAt} />
                </div>
              </Card>

              <div className="space-y-8">
                {preview.statements.map((statement) => (
                  <StatementCard key={statement.key} statement={statement} />
                ))}
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                These beta financial statements are for internal accountant review before client,
                tax, bank, or regulatory use.
              </div>
            </>
          )}
        </div>
      </ClientRequired>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-bold text-slate-900">{value}</p>
    </div>
  );
}

function StatementCard({ statement }: { statement: Statement }) {
  return (
    <Card>
      <div className="border-b border-slate-200 pb-4">
        <h2 className="text-2xl font-bold text-slate-900">{statement.title}</h2>
        <p className="mt-1 text-sm text-slate-500">{statement.subtitle}</p>
      </div>

      <div className="mt-6 space-y-8">
        {statement.sections.map((section) => (
          <div key={`${statement.key}-${section.title}`}>
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
        ))}
      </div>
    </Card>
  );
}
