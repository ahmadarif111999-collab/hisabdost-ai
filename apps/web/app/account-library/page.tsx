'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Button, Card, Input, Select } from '@/components/Card';
import { api, getBusinessId } from '@/lib/api';

type AccountTemplate = {
  id?: string;
  code: string;
  name: string;
  type: string;
  description?: string;
  category?: string;
  isTaxSensitive?: boolean;
  requiresReview?: boolean;
  isSystem?: boolean;
};

type AccountHeadRequest = {
  id: string;
  requestedName: string;
  suggestedName: string;
  suggestedCode?: string;
  suggestedType: string;
  status: string;
  reason?: string;
  business: {
    name: string;
  };
  requestedBy?: {
    name: string;
    email: string;
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

function isTaxOrReviewHead(account: AccountTemplate) {
  const text = `${account.code} ${account.name} ${account.description || ''}`.toLowerCase();

  return Boolean(
    account.isTaxSensitive ||
      account.requiresReview ||
      TAX_KEYWORDS.some((keyword) => text.includes(keyword)),
  );
}

function accountSort(a: AccountTemplate, b: AccountTemplate) {
  return String(a.code).localeCompare(String(b.code), undefined, { numeric: true });
}

export default function AccountLibraryPage() {
  const [templates, setTemplates] = useState<AccountTemplate[]>([]);
  const [requests, setRequests] = useState<AccountHeadRequest[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [taxOnly, setTaxOnly] = useState(false);

  const [loading, setLoading] = useState(true);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [importingDefaults, setImportingDefaults] = useState(false);
  const [decidingRequestId, setDecidingRequestId] = useState<string | null>(null);

  const [form, setForm] = useState({
    code: '',
    name: '',
    type: 'EXPENSE',
    description: '',
    category: '',
  });

  async function load() {
    setError('');

    try {
      const [accountLibrary, accountRequests] = await Promise.all([
        api<AccountTemplate[]>('/firm/account-library'),
        api<AccountHeadRequest[]>('/firm/account-head-requests'),
      ]);

      setTemplates((accountLibrary || []).slice().sort(accountSort));
      setRequests(accountRequests || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load account library');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filteredTemplates = useMemo(() => {
    const query = search.trim().toLowerCase();

    return templates.filter((template) => {
      const matchesType = typeFilter === 'ALL' || template.type === typeFilter;
      const matchesTax = !taxOnly || isTaxOrReviewHead(template);

      const matchesSearch =
        !query ||
        `${template.code} ${template.name} ${template.description || ''} ${template.type}`
          .toLowerCase()
          .includes(query);

      return matchesType && matchesTax && matchesSearch;
    });
  }, [templates, search, typeFilter, taxOnly]);

  const groupedTemplates = ACCOUNT_TYPES.filter((type) => type !== 'ALL')
    .map((type) => ({
      type,
      rows: filteredTemplates.filter((template) => template.type === type),
    }))
    .filter((group) => group.rows.length > 0);

  const taxHeadsCount = templates.filter(isTaxOrReviewHead).length;
  const pendingRequests = requests.filter((request) => request.status === 'pending');

  async function saveTemplate(e: FormEvent) {
    e.preventDefault();

    if (savingTemplate) return;

    setMessage('');
    setError('');
    setSavingTemplate(true);

    try {
      await api('/firm/account-library', {
        method: 'POST',
        body: JSON.stringify(form),
      });

      setForm({
        code: '',
        name: '',
        type: 'EXPENSE',
        description: '',
        category: '',
      });

      setMessage('Firm account library updated. New clients will receive this head by default.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save account head');
    } finally {
      setSavingTemplate(false);
    }
  }

  async function approve(id: string) {
    if (decidingRequestId) return;

    setMessage('');
    setError('');
    setDecidingRequestId(id);

    try {
      await api(`/firm/account-head-requests/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({}),
      });

      setMessage('Account head request approved.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not approve request');
    } finally {
      setDecidingRequestId(null);
    }
  }

  async function reject(id: string) {
    if (decidingRequestId) return;

    setMessage('');
    setError('');
    setDecidingRequestId(id);

    try {
      await api(`/firm/account-head-requests/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({
          decisionNote: 'Rejected by firm review.',
        }),
      });

      setMessage('Account head request rejected.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reject request');
    } finally {
      setDecidingRequestId(null);
    }
  }

  async function importDefaults() {
    if (importingDefaults) return;

    const businessId = getBusinessId();

    if (!businessId) {
      setError('Select a client first before importing default accounts.');
      return;
    }

    setMessage('');
    setError('');
    setImportingDefaults(true);

    try {
      await api(`/firm/clients/${businessId}/accounts/import-defaults`, {
        method: 'POST',
      });

      setMessage('Default firm accounts imported/repaired for the selected client.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not import defaults');
    } finally {
      setImportingDefaults(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-7xl px-4 py-8">
          <Card>
            <p className="text-sm text-slate-600">Loading firm account library...</p>
          </Card>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        <div className="rounded-3xl bg-slate-950 p-6 text-white shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
            Firm-controlled chart of accounts
          </p>
          <h1 className="mt-2 text-3xl font-bold">Firm Account Library</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-300">
            These default heads are controlled at firm level. Tax-sensitive heads are clearly marked
            so client accounts, reports, and approvals remain reviewable.
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
          <Metric label="Total heads" value={String(templates.length)} />
          <Metric label="Tax / review heads" value={String(taxHeadsCount)} />
          <Metric label="Pending requests" value={String(pendingRequests.length)} />
          <Metric label="Account types" value="5" />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.45fr_1fr]">
          <Card>
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Default firm accounts</h2>
                <p className="text-sm text-slate-500">
                  Use filters to verify tax heads, review-sensitive heads, and normal accounting
                  heads.
                </p>
              </div>

              <button
                type="button"
                onClick={importDefaults}
                disabled={importingDefaults}
                className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {importingDefaults ? 'Importing...' : 'Import defaults to selected client'}
              </button>
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
              {groupedTemplates.map((group) => (
                <div key={group.type}>
                  <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
                    {group.type}
                  </h3>

                  <div className="overflow-hidden rounded-2xl border border-slate-200">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Code</th>
                          <th className="px-4 py-3">Head</th>
                          <th className="px-4 py-3">Type</th>
                          <th className="px-4 py-3">Review</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-100">
                        {group.rows.map((template) => {
                          const taxSensitive = isTaxOrReviewHead(template);

                          return (
                            <tr key={`${template.code}-${template.name}`} className="bg-white">
                              <td className="px-4 py-3 font-mono text-xs font-bold text-slate-700">
                                {template.code}
                              </td>
                              <td className="px-4 py-3">
                                <p className="font-semibold text-slate-900">{template.name}</p>
                                {template.description && (
                                  <p className="mt-1 text-xs text-slate-500">
                                    {template.description}
                                  </p>
                                )}
                              </td>
                              <td className="px-4 py-3 text-slate-600">{template.type}</td>
                              <td className="px-4 py-3">
                                {taxSensitive ? (
                                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                                    Tax / review
                                  </span>
                                ) : template.isSystem ? (
                                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                                    System
                                  </span>
                                ) : (
                                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                                    Normal
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

              {!filteredTemplates.length && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  No account heads match the current filters.
                </div>
              )}
            </div>
          </Card>

          <div className="space-y-6">
            <Card>
              <h2 className="text-xl font-bold text-slate-900">Add firm default head</h2>
              <p className="mt-1 text-sm text-slate-500">
                This adds a firm-level account template. Tax words automatically mark review heads.
              </p>

              <form onSubmit={saveTemplate} className="mt-5 space-y-3">
                <Input
                  placeholder="Code e.g. 2230"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  required
                  disabled={savingTemplate}
                />

                <Input
                  placeholder="Head name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  disabled={savingTemplate}
                />

                <Select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  disabled={savingTemplate}
                >
                  <option>ASSET</option>
                  <option>LIABILITY</option>
                  <option>EQUITY</option>
                  <option>INCOME</option>
                  <option>EXPENSE</option>
                </Select>

                <Input
                  placeholder="Category optional"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  disabled={savingTemplate}
                />

                <Input
                  placeholder="Description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  disabled={savingTemplate}
                />

                <Button
                  type="submit"
                  disabled={savingTemplate}
                  className="w-full disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingTemplate ? 'Saving...' : 'Save to firm library'}
                </Button>
              </form>
            </Card>

            <Card>
              <h2 className="text-xl font-bold text-slate-900">Pending account requests</h2>
              <p className="mt-1 text-sm text-slate-500">
                Client-specific heads should be approved by the firm.
              </p>

              <div className="mt-5 space-y-3">
                {pendingRequests.map((request) => (
                  <div key={request.id} className="rounded-2xl border border-slate-200 p-4">
                    <p className="font-semibold text-slate-900">
                      {request.suggestedName} ({request.suggestedType})
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      Client: {request.business.name} • Requested by{' '}
                      {request.requestedBy?.name || request.requestedBy?.email || 'Client user'}
                    </p>

                    {request.reason && (
                      <p className="mt-2 text-sm text-slate-600">{request.reason}</p>
                    )}

                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => approve(request.id)}
                        disabled={decidingRequestId === request.id}
                        className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {decidingRequestId === request.id ? 'Working...' : 'Approve'}
                      </button>

                      <button
                        type="button"
                        onClick={() => reject(request.id)}
                        disabled={decidingRequestId === request.id}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}

                {!pendingRequests.length && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    No pending account-head requests.
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
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
