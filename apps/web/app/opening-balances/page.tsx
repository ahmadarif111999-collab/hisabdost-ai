'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { ClientRequired } from '@/components/ClientRequired';
import { Button, Card, Input, Select } from '@/components/Card';
import { api, getBusinessId } from '@/lib/api';

type Period = {
  id: string;
  label: string;
  startDateDisplay: string;
  endDateDisplay: string;
  status: 'OPEN' | 'AUTO_CLOSED' | 'REOPENED' | 'FINAL_CLOSED';
};

type OpeningRow = {
  accountId: string;
  code: string;
  account: string;
  type: string;
  debit: number;
  credit: number;
  requiresReview?: boolean;
  isSystem?: boolean;
};

type WizardData = {
  business: {
    id: string;
    name: string;
    entityType: string;
  };
  currentPeriod: Period;
  selectedPeriod: Period;
  periods: Period[];
  canEdit: boolean;
  warning?: string | null;
  totals: {
    debit: number;
    credit: number;
    difference: number;
    balanced: boolean;
  };
  openingEntry?: {
    id: string;
    narration: string;
    isSystemGenerated: boolean;
  } | null;
  rows: OpeningRow[];
};

function money(value: number) {
  return Number(value || 0).toLocaleString('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function toInput(value: number) {
  return value ? String(value) : '';
}

export default function OpeningBalancesPage() {
  const [data, setData] = useState<WizardData | null>(null);
  const [rows, setRows] = useState<OpeningRow[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [narration, setNarration] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const totals = useMemo(() => {
    const debit = rows.reduce((sum, row) => sum + Number(row.debit || 0), 0);
    const credit = rows.reduce((sum, row) => sum + Number(row.credit || 0), 0);
    const difference = Math.round((debit - credit) * 100) / 100;

    return {
      debit,
      credit,
      difference,
      balanced: Math.abs(difference) < 0.01,
    };
  }, [rows]);

  async function load(periodId?: string) {
    const businessId = getBusinessId();

    if (!businessId) return;

    setError('');

    try {
      const url = periodId
        ? `/periods/businesses/${businessId}/periods/${periodId}/opening-balances`
        : `/periods/businesses/${businessId}/opening-balances`;

      const result = await api<WizardData>(url);

      setData(result);
      setRows(result.rows || []);
      setSelectedPeriodId(result.selectedPeriod.id);
      setNarration(
        result.openingEntry?.narration ||
          `Opening balances entered manually for ${result.selectedPeriod.label}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load opening balances');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function changePeriod(periodId: string) {
    setSelectedPeriodId(periodId);
    setLoading(true);
    await load(periodId);
  }

  function updateRow(accountId: string, field: 'debit' | 'credit', value: string) {
    const numberValue = value === '' ? 0 : Number(value);

    if (Number.isNaN(numberValue) || numberValue < 0) {
      return;
    }

    setRows((current) =>
      current.map((row) => {
        if (row.accountId !== accountId) return row;

        if (field === 'debit') {
          return {
            ...row,
            debit: numberValue,
            credit: numberValue > 0 ? 0 : row.credit,
          };
        }

        return {
          ...row,
          credit: numberValue,
          debit: numberValue > 0 ? 0 : row.debit,
        };
      }),
    );
  }

  function clearAll() {
    setRows((current) =>
      current.map((row) => ({
        ...row,
        debit: 0,
        credit: 0,
      })),
    );
  }

  async function save(e: FormEvent) {
    e.preventDefault();

    if (saving || !data) return;

    if (!totals.balanced) {
      setError(`Opening balance is not balanced. Difference: ${money(totals.difference)}.`);
      return;
    }

    const businessId = getBusinessId();

    if (!businessId) return;

    setMessage('');
    setError('');
    setSaving(true);

    try {
      await api(`/periods/businesses/${businessId}/periods/${selectedPeriodId}/opening-balances`, {
        method: 'POST',
        body: JSON.stringify({
          narration,
          reason: reason || 'Opening balances entered from Opening Balance Wizard.',
          rows: rows
            .filter((row) => Number(row.debit || 0) > 0 || Number(row.credit || 0) > 0)
            .map((row) => ({
              accountId: row.accountId,
              debit: Number(row.debit || 0),
              credit: Number(row.credit || 0),
            })),
        }),
      });

      setMessage('Opening balances saved and journal entry posted.');
      setReason('');
      await load(selectedPeriodId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save opening balances');
    } finally {
      setSaving(false);
    }
  }

  async function repair() {
    if (repairing || !data) return;

    const businessId = getBusinessId();

    if (!businessId) return;

    const ok = window.confirm(
      `This will recalculate opening balances for ${data.selectedPeriod.label} from previous posted entries. Continue?`,
    );

    if (!ok) return;

    setMessage('');
    setError('');
    setRepairing(true);

    try {
      await api(`/periods/businesses/${businessId}/periods/${selectedPeriodId}/repair-opening-balances`, {
        method: 'POST',
      });

      setMessage('Opening balances recalculated from previous-period postings.');
      await load(selectedPeriodId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not repair opening balances');
    } finally {
      setRepairing(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <ClientRequired title="Select a client to manage opening balances">
          <div className="mx-auto max-w-7xl px-4 py-8">
            <Card>
              <p className="text-sm text-slate-600">Loading opening balances...</p>
            </Card>
          </div>
        </ClientRequired>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <ClientRequired title="Select a client to manage opening balances">
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
          <div className="rounded-3xl bg-slate-950 p-6 text-white shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
              Opening balance wizard
            </p>
            <h1 className="mt-2 text-3xl font-bold">Opening Balances</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">
              Enter account-wise opening debit and credit balances. The system validates that total
              debit equals total credit before posting the opening-balance journal.
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

          {data && (
            <>
              <div className="grid gap-4 md:grid-cols-4">
                <Metric label="Client" value={data.business.name} />
                <Metric label="Period" value={data.selectedPeriod.label} />
                <Metric label="Debit" value={money(totals.debit)} />
                <Metric label="Credit" value={money(totals.credit)} />
              </div>

              <Card>
                <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr]">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Accounting period
                    </label>
                    <Select
                      value={selectedPeriodId}
                      onChange={(e) => changePeriod(e.target.value)}
                    >
                      {data.periods.map((period) => (
                        <option key={period.id} value={period.id}>
                          {period.label} — {period.status}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Period dates
                    </label>
                    <div className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
                      {data.selectedPeriod.startDateDisplay} to {data.selectedPeriod.endDateDisplay}
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Status
                    </label>
                    <div className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
                      {data.selectedPeriod.status.replaceAll('_', ' ')}
                    </div>
                  </div>
                </div>

                {data.warning && (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    {data.warning}
                  </div>
                )}

                {!data.canEdit && (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    This period cannot be edited from the opening-balance wizard.
                  </div>
                )}
              </Card>

              <form onSubmit={save} className="space-y-6">
                <Card>
                  <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Narration
                      </label>
                      <Input
                        value={narration}
                        onChange={(e) => setNarration(e.target.value)}
                        disabled={!data.canEdit}
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Reason / note
                      </label>
                      <Input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Optional"
                        disabled={!data.canEdit}
                      />
                    </div>
                  </div>
                </Card>

                <Card>
                  <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">Account-wise balances</h2>
                      <p className="mt-1 text-sm text-slate-500">
                        Enter debit or credit on each account. Do not enter both on one line.
                      </p>
                    </div>

                    <div
                      className={`rounded-2xl px-4 py-3 text-sm font-bold ${
                        totals.balanced
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-red-50 text-red-700'
                      }`}
                    >
                      Difference: {money(totals.difference)}
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-slate-200">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Code</th>
                          <th className="px-4 py-3">Account</th>
                          <th className="px-4 py-3">Type</th>
                          <th className="px-4 py-3 text-right">Debit</th>
                          <th className="px-4 py-3 text-right">Credit</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-100">
                        {rows.map((row) => (
                          <tr key={row.accountId} className="bg-white">
                            <td className="px-4 py-3 font-semibold text-slate-900">{row.code}</td>
                            <td className="px-4 py-3">
                              <p className="font-semibold text-slate-900">{row.account}</p>
                              {row.requiresReview && (
                                <p className="text-xs font-semibold text-amber-700">Review required</p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-600">{row.type}</td>
                            <td className="px-4 py-3">
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={toInput(row.debit)}
                                onChange={(e) => updateRow(row.accountId, 'debit', e.target.value)}
                                disabled={!data.canEdit}
                                className="text-right"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={toInput(row.credit)}
                                onChange={(e) => updateRow(row.accountId, 'credit', e.target.value)}
                                disabled={!data.canEdit}
                                className="text-right"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>

                      <tfoot className="bg-slate-50 text-sm font-bold text-slate-900">
                        <tr>
                          <td className="px-4 py-3" colSpan={3}>
                            Total
                          </td>
                          <td className="px-4 py-3 text-right">{money(totals.debit)}</td>
                          <td className="px-4 py-3 text-right">{money(totals.credit)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="text-sm text-slate-500">
                      {data.openingEntry
                        ? `Existing opening journal: ${data.openingEntry.isSystemGenerated ? 'System-generated' : 'Manual'}`
                        : 'No opening-balance journal posted yet.'}
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={clearAll}
                        disabled={!data.canEdit}
                        className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Clear All
                      </button>

                      <button
                        type="button"
                        onClick={repair}
                        disabled={repairing}
                        className="rounded-2xl border border-amber-200 px-4 py-3 text-sm font-bold text-amber-800 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {repairing ? 'Repairing...' : 'Repair / Recalculate'}
                      </button>

                      <Button
                        type="submit"
                        disabled={!data.canEdit || saving || !totals.balanced}
                        className="disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {saving ? 'Saving...' : 'Save & Post Opening Journal'}
                      </Button>
                    </div>
                  </div>
                </Card>
              </form>
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
