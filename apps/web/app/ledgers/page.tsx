'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { ClientRequired } from '@/components/ClientRequired';
import { Card, Input, Select } from '@/components/Card';
import { api, getBusinessId } from '@/lib/api';

type Account = {
  id: string;
  code: string;
  name: string;
  type: string;
};

type LedgerRow = {
  id: string;
  journalEntryId: string;
  entryNo: string;
  date: string;
  narration: string;
  description?: string;
  sourceType: string;
  debit: number;
  credit: number;
  balance: number;
};

type LedgerResponse = {
  account: Account;
  period: {
    from: string | null;
    to: string | null;
  };
  openingBalance: number;
  rows: LedgerRow[];
  periodDebit: number;
  periodCredit: number;
  closingBalance: number;
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
  });
}

export default function LedgersPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState('');
  const [from, setFrom] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [ledger, setLedger] = useState<LedgerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [error, setError] = useState('');

  async function loadAccounts() {
    const businessId = getBusinessId();

    if (!businessId) return;

    setLoading(true);
    setError('');

    try {
      const data = await api<Account[]>(`/accounting/businesses/${businessId}/accounts`);
      setAccounts(data);

      if (data.length && !accountId) {
        setAccountId(data[0].id);
        await loadLedger(data[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load accounts');
    } finally {
      setLoading(false);
    }
  }

  async function loadLedger(nextAccountId = accountId) {
    const businessId = getBusinessId();

    if (!businessId || !nextAccountId) return;

    setLoadingLedger(true);
    setError('');

    try {
      const params = new URLSearchParams();

      if (from) params.set('from', from);
      if (to) params.set('to', to);

      const data = await api<LedgerResponse>(
        `/accounting/businesses/${businessId}/views/ledger/${nextAccountId}?${params.toString()}`,
      );

      setLedger(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load ledger');
    } finally {
      setLoadingLedger(false);
    }
  }

  useEffect(() => {
    loadAccounts();
  }, []);

  function onAccountChange(value: string) {
    setAccountId(value);
    loadLedger(value);
  }

  return (
    <AppShell>
      <ClientRequired title="Select a client to view ledgers">
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
          <div className="rounded-3xl bg-slate-950 p-6 text-white shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
              Account movement
            </p>
            <h1 className="mt-2 text-3xl font-bold">Ledgers</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">
              Select an account and date range to view opening balance, debit and credit
              movements, running balance, and closing balance.
            </p>
          </div>

          <Card>
            <div className="grid gap-3 lg:grid-cols-[2fr_1fr_1fr_auto] lg:items-end">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Account
                </label>
                <Select
                  value={accountId}
                  onChange={(e) => onAccountChange(e.target.value)}
                  disabled={loading || !accounts.length}
                >
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.code} — {account.name} ({account.type})
                    </option>
                  ))}
                </Select>
              </div>

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
                onClick={() => loadLedger()}
                disabled={loadingLedger || !accountId}
                className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingLedger ? 'Loading...' : 'Apply'}
              </button>
            </div>
          </Card>

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {ledger && (
            <>
              <div className="grid gap-4 md:grid-cols-4">
                <Metric label="Opening balance" value={money(ledger.openingBalance)} />
                <Metric label="Period debit" value={money(ledger.periodDebit)} />
                <Metric label="Period credit" value={money(ledger.periodCredit)} />
                <Metric label="Closing balance" value={money(ledger.closingBalance)} />
              </div>

              <Card>
                <div className="mb-4">
                  <h2 className="text-xl font-bold text-slate-900">
                    {ledger.account.code} — {ledger.account.name}
                  </h2>
                  <p className="text-sm text-slate-500">
                    {ledger.account.type} ledger from {ledger.period.from || 'start'} to{' '}
                    {ledger.period.to || 'today'}
                  </p>
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
                        <th className="px-4 py-3 text-right">Balance</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      <tr className="bg-slate-50">
                        <td className="px-4 py-3 text-slate-600">
                          {ledger.period.from || '-'}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900">Opening</td>
                        <td className="px-4 py-3 text-slate-600">Opening balance</td>
                        <td className="px-4 py-3 text-right">-</td>
                        <td className="px-4 py-3 text-right">-</td>
                        <td className="px-4 py-3 text-right font-bold">
                          {money(ledger.openingBalance)}
                        </td>
                      </tr>

                      {ledger.rows.map((row) => (
                        <tr key={row.id} className="bg-white">
                          <td className="px-4 py-3 text-slate-600">{formatDate(row.date)}</td>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-900">{row.entryNo}</p>
                            <p className="text-xs text-slate-500">{row.sourceType}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-slate-700">{row.narration}</p>
                            {row.description && (
                              <p className="text-xs text-slate-500">{row.description}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">{money(row.debit)}</td>
                          <td className="px-4 py-3 text-right">{money(row.credit)}</td>
                          <td className="px-4 py-3 text-right font-semibold">
                            {money(row.balance)}
                          </td>
                        </tr>
                      ))}

                      {!ledger.rows.length && (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                            No ledger movement found for this period.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      </ClientRequired>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
    </Card>
  );
}
