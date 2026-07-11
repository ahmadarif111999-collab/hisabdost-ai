'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { ClientRequired } from '@/components/ClientRequired';
import { Button, Card, Input, Select } from '@/components/Card';
import { api, getBusinessId } from '@/lib/api';

type Account = {
  id: string;
  code: string;
  name: string;
  type: string;
  description?: string;
  requiresReview?: boolean;
  isSystem?: boolean;
};

type AiSuggestion = {
  actionId: string;
  suggestion: {
    name: string;
    type: string;
    description?: string;
    confidence: number;
    explanation: string;
    similarExistingAccountName?: string;
    requiresAccountantReview: boolean;
  };
};

const ACCOUNT_TYPES = ['ALL', 'ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'];

const TAX_KEYWORDS = [
  'tax',
  'sales tax',
  'input sales tax',
  'withholding',
  'advance income',
  'income tax',
  'salary payable',
  'legal',
  'consultant',
  'donation',
];

function isTaxOrReviewHead(account: Account) {
  const text = `${account.code} ${account.name} ${account.description || ''}`.toLowerCase();

  return Boolean(
    account.requiresReview || TAX_KEYWORDS.some((keyword) => text.includes(keyword)),
  );
}

function accountSort(a: Account, b: Account) {
  return String(a.code).localeCompare(String(b.code), undefined, { numeric: true });
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [prompt, setPrompt] = useState('Add head for Daraz commission');
  const [suggestion, setSuggestion] = useState<AiSuggestion | null>(null);

  const [manual, setManual] = useState({
    name: '',
    type: 'EXPENSE',
    description: '',
  });

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [taxOnly, setTaxOnly] = useState(false);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [askingAi, setAskingAi] = useState(false);
  const [approvingAi, setApprovingAi] = useState(false);
  const [creatingManual, setCreatingManual] = useState(false);

  async function load() {
    const businessId = getBusinessId();

    if (!businessId) return;

    setError('');

    try {
      const data = await api<Account[]>(`/accounting/businesses/${businessId}/accounts`);
      setAccounts((data || []).slice().sort(accountSort));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load accounts');
    } finally {
      setLoadingAccounts(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filteredAccounts = useMemo(() => {
    const query = search.trim().toLowerCase();

    return accounts.filter((account) => {
      const matchesType = typeFilter === 'ALL' || account.type === typeFilter;
      const matchesTax = !taxOnly || isTaxOrReviewHead(account);

      const matchesSearch =
        !query ||
        `${account.code} ${account.name} ${account.description || ''} ${account.type}`
          .toLowerCase()
          .includes(query);

      return matchesType && matchesTax && matchesSearch;
    });
  }, [accounts, search, typeFilter, taxOnly]);

  const grouped = ACCOUNT_TYPES.filter((type) => type !== 'ALL')
    .map((type) => ({
      type,
      rows: filteredAccounts.filter((account) => account.type === type),
    }))
    .filter((group) => group.rows.length > 0);

  const taxHeadsCount = accounts.filter(isTaxOrReviewHead).length;
  const systemHeadsCount = accounts.filter((account) => account.isSystem).length;
  const customHeadsCount = accounts.filter((account) => !account.isSystem).length;

  async function askAi(e: FormEvent) {
    e.preventDefault();

    if (askingAi) return;

    const businessId = getBusinessId();

    if (!businessId) return;

    setMessage('');
    setError('');
    setAskingAi(true);

    try {
      const data = await api<AiSuggestion>(`/ai/businesses/${businessId}/suggest-account-head`, {
        method: 'POST',
        body: JSON.stringify({ prompt }),
      });

      setSuggestion(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not get AI suggestion');
    } finally {
      setAskingAi(false);
    }
  }

  async function approveAi() {
    const businessId = getBusinessId();

    if (!businessId || !suggestion || approvingAi) return;

    setMessage('');
    setError('');
    setApprovingAi(true);

    try {
      await api(`/ai/businesses/${businessId}/actions/${suggestion.actionId}/approve`, {
        method: 'POST',
      });

      setMessage('AI account head approved and created.');
      setSuggestion(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not approve AI suggestion');
    } finally {
      setApprovingAi(false);
    }
  }

  async function createManual(e: FormEvent) {
    e.preventDefault();

    if (creatingManual) return;

    const businessId = getBusinessId();

    if (!businessId) return;

    setMessage('');
    setError('');
    setCreatingManual(true);

    try {
      await api(`/accounting/businesses/${businessId}/accounts`, {
        method: 'POST',
        body: JSON.stringify(manual),
      });

      setManual({
        name: '',
        type: 'EXPENSE',
        description: '',
      });

      setMessage('Account head created.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create account head');
    } finally {
      setCreatingManual(false);
    }
  }

  if (loadingAccounts) {
    return (
      <AppShell>
        <ClientRequired title="Select a client to view chart of accounts">
          <div className="mx-auto max-w-7xl px-4 py-8">
            <Card>
              <p className="text-sm text-slate-600">Loading chart of accounts...</p>
            </Card>
          </div>
        </ClientRequired>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <ClientRequired title="Select a client to view chart of accounts">
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
          <div className="rounded-3xl bg-slate-950 p-6 text-white shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
              Client chart of accounts
            </p>
            <h1 className="mt-2 text-3xl font-bold">Chart of Accounts</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">
              View system, custom, and tax-sensitive account heads for the selected client.
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

          <div className="grid gap-4 md:grid-cols-4">
            <Metric label="Total heads" value={String(accounts.length)} />
            <Metric label="System heads" value={String(systemHeadsCount)} />
            <Metric label="Custom heads" value={String(customHeadsCount)} />
            <Metric label="Tax / review heads" value={String(taxHeadsCount)} />
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.45fr_1fr]">
            <Card>
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Accounts list</h2>
                  <p className="text-sm text-slate-500">
                    Filter by type, search by name/code, or show only tax-sensitive accounts.
                  </p>
                </div>

                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                  {filteredAccounts.length} shown
                </span>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-[1.4fr_0.8fr_auto] md:items-center">
                <Input
                  placeholder="Search by code, name, description..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />

                <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                  {ACCOUNT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type === 'ALL' ? 'All account types' : type}
                    </option>
                  ))}
                </Select>

                <label className="flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={taxOnly}
                    onChange={(e) => setTaxOnly(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Tax/review only
                </label>
              </div>

              <div className="mt-5 space-y-5">
                {grouped.map((group) => (
                  <div key={group.type}>
                    <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
                      {group.type}
                    </h3>

                    <div className="overflow-hidden rounded-2xl border border-slate-200">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-4 py-3">Code</th>
                            <th className="px-4 py-3">Account head</th>
                            <th className="px-4 py-3">Type</th>
                            <th className="px-4 py-3">Status</th>
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-100">
                          {group.rows.map((account) => {
                            const taxSensitive = isTaxOrReviewHead(account);

                            return (
                              <tr key={account.id} className="bg-white">
                                <td className="px-4 py-3 font-mono text-xs font-bold text-slate-700">
                                  {account.code}
                                </td>

                                <td className="px-4 py-3">
                                  <p className="font-semibold text-slate-900">{account.name}</p>
                                  {account.description && (
                                    <p className="mt-1 text-xs text-slate-500">
                                      {account.description}
                                    </p>
                                  )}
                                </td>

                                <td className="px-4 py-3 text-slate-600">{account.type}</td>

                                <td className="px-4 py-3">
                                  {taxSensitive ? (
                                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                                      Tax / review
                                    </span>
                                  ) : account.isSystem ? (
                                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                                      System
                                    </span>
                                  ) : (
                                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                                      Custom
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}

                {!filteredAccounts.length && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    No accounts match the selected filters.
                  </div>
                )}
              </div>
            </Card>

            <div className="space-y-6">
              <Card>
                <h2 className="text-xl font-bold text-slate-900">Ask AI to add a head</h2>
                <p className="mt-1 text-sm text-slate-500">
                  AI suggests the account head. Accountant/user approval is still required.
                </p>

                <form onSubmit={askAi} className="mt-5 space-y-3">
                  <Input
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="e.g. Add head for owner cash withdrawals"
                    disabled={askingAi}
                  />

                  <Button
                    type="submit"
                    disabled={askingAi}
                    className="w-full disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {askingAi ? 'Thinking...' : 'Suggest Head'}
                  </Button>
                </form>

                {suggestion && (
                  <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                    <p className="font-bold text-emerald-900">
                      {suggestion.suggestion.name} — {suggestion.suggestion.type}
                    </p>

                    <p className="mt-2 text-sm text-emerald-800">
                      {suggestion.suggestion.explanation}
                    </p>

                    {suggestion.suggestion.similarExistingAccountName && (
                      <p className="mt-2 text-xs text-emerald-700">
                        Similar existing head: {suggestion.suggestion.similarExistingAccountName}
                      </p>
                    )}

                    {suggestion.suggestion.requiresAccountantReview && (
                      <p className="mt-2 text-xs font-bold text-amber-700">
                        Accountant review recommended.
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={approveAi}
                      disabled={approvingAi}
                      className="mt-3 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {approvingAi ? 'Approving...' : 'Approve & Create'}
                    </button>
                  </div>
                )}
              </Card>

              <Card>
                <h2 className="text-xl font-bold text-slate-900">Manual head</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Add a client-specific account head manually.
                </p>

                <form onSubmit={createManual} className="mt-5 space-y-3">
                  <Input
                    placeholder="Account head name"
                    value={manual.name}
                    onChange={(e) => setManual({ ...manual, name: e.target.value })}
                    required
                    disabled={creatingManual}
                  />

                  <Select
                    value={manual.type}
                    onChange={(e) => setManual({ ...manual, type: e.target.value })}
                    disabled={creatingManual}
                  >
                    <option>ASSET</option>
                    <option>LIABILITY</option>
                    <option>EQUITY</option>
                    <option>INCOME</option>
                    <option>EXPENSE</option>
                  </Select>

                  <Input
                    placeholder="Description"
                    value={manual.description}
                    onChange={(e) => setManual({ ...manual, description: e.target.value })}
                    disabled={creatingManual}
                  />

                  <Button
                    type="submit"
                    disabled={creatingManual}
                    className="w-full disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {creatingManual ? 'Creating...' : 'Create Head'}
                  </Button>
                </form>
              </Card>
            </div>
          </div>
        </div>
      </ClientRequired>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
    </Card>
  );
}
