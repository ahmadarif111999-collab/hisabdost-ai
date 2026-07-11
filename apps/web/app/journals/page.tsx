'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { ClientRequired } from '@/components/ClientRequired';
import { Card, Input } from '@/components/Card';
import { api, getBusinessId } from '@/lib/api';

type JournalLine = {
  id: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  debit: number;
  credit: number;
  description?: string;
};

type JournalEntry = {
  id: string;
  entryNo: string;
  entryDate: string;
  sourceType: string;
  narration: string;
  status: string;
  debitTotal: number;
  creditTotal: number;
  createdBy: string;
  approvedBy: string;
  linesCount: number;
  lines: JournalLine[];
};

function money(value: number) {
  return Number(value || 0).toLocaleString('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('en-PK', {
    timeZone: 'Asia/Karachi',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function JournalsPage() {
  const [rows, setRows] = useState<JournalEntry[]>([]);
  const [selected, setSelected] = useState<JournalEntry | null>(null);
  const [from, setFrom] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    const businessId = getBusinessId();

    if (!businessId) return;

    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();

      if (from) params.set('from', from);
      if (to) params.set('to', to);

      const data = await api<{ rows: JournalEntry[] }>(
        `/accounting/businesses/${businessId}/views/journal-entries?${params.toString()}`,
      );

      setRows(data.rows || []);
      setSelected(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load journal entries');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <AppShell>
      <ClientRequired title="Select a client to view journal entries">
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
          <div className="rounded-3xl bg-slate-950 p-6 text-white shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
              Accounting trail
            </p>
            <h1 className="mt-2 text-3xl font-bold">Journal Entries</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">
              View all posted accounting entries with debit and credit lines, source type,
              narration, and creator details.
            </p>
          </div>

          <Card>
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Start date
                </label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  End date
                </label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>

              <button
                type="button"
                onClick={load}
                disabled={loading}
                className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Loading...' : 'Apply'}
              </button>
            </div>
          </Card>

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
            <Card>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Posted entries</h2>
                  <p className="text-sm text-slate-500">{rows.length} entries found</p>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Entry</th>
                      <th className="px-4 py-3">Narration</th>
                      <th className="px-4 py-3 text-right">Debit</th>
                      <th className="px-4 py-3 text-right">Credit</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {rows.map((entry) => (
                      <tr
                        key={entry.id}
                        onClick={() => setSelected(entry)}
                        className={`cursor-pointer bg-white hover:bg-emerald-50 ${
                          selected?.id === entry.id ? 'bg-emerald-50' : ''
                        }`}
                      >
                        <td className="px-4 py-3 text-slate-600">{formatDate(entry.entryDate)}</td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">{entry.entryNo}</p>
                          <p className="text-xs text-slate-500">{entry.sourceType}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{entry.narration}</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">
                          {money(entry.debitTotal)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">
                          {money(entry.creditTotal)}
                        </td>
                      </tr>
                    ))}

                    {!rows.length && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                          No journal entries found for this period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card>
              <h2 className="text-xl font-bold text-slate-900">Entry detail</h2>

              {!selected && (
                <p className="mt-4 text-sm text-slate-500">
                  Select a journal entry from the table to view its debit and credit lines.
                </p>
              )}

              {selected && (
                <div className="mt-4 space-y-4">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {selected.entryNo}
                    </p>
                    <p className="mt-1 font-semibold text-slate-900">{selected.narration}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Created by {selected.createdBy} • Status {selected.status}
                    </p>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-slate-200">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Account</th>
                          <th className="px-3 py-2 text-right">Debit</th>
                          <th className="px-3 py-2 text-right">Credit</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-100">
                        {selected.lines.map((line) => (
                          <tr key={line.id}>
                            <td className="px-3 py-2">
                              <p className="font-semibold text-slate-900">
                                {line.accountCode} — {line.accountName}
                              </p>
                              {line.description && (
                                <p className="text-xs text-slate-500">{line.description}</p>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">{money(line.debit)}</td>
                            <td className="px-3 py-2 text-right">{money(line.credit)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      </ClientRequired>
    </AppShell>
  );
}
