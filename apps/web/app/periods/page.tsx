'use client';

import { FormEvent, useEffect, useState } from 'react';
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
  autoClosedAtDisplay?: string | null;
  reopenedAtDisplay?: string | null;
  reopenReason?: string | null;
  finalizedAtDisplay?: string | null;
  openingBalancesCount?: number;
};

type OpeningSummary = {
  count: number;
  totalDebit: number;
  totalCredit: number;
  difference: number;
  rows: Array<{
    id: string;
    code: string;
    account: string;
    type: string;
    debit: number;
    credit: number;
  }>;
};

type Dashboard = {
  business: {
    id: string;
    name: string;
    entityType: string;
    fiscalYearStartMonth: number;
    fiscalYearStartDay: number;
  };
  currentPeriod: Period;
  periods: Period[];
  openingSummary: OpeningSummary;
  permissions: {
    canReopenPreviousPeriod: boolean;
    canFinalClosePeriod: boolean;
  };
};

const months = [
  ['1', 'January'],
  ['2', 'February'],
  ['3', 'March'],
  ['4', 'April'],
  ['5', 'May'],
  ['6', 'June'],
  ['7', 'July'],
  ['8', 'August'],
  ['9', 'September'],
  ['10', 'October'],
  ['11', 'November'],
  ['12', 'December'],
];

function money(value: number) {
  return Number(value || 0).toLocaleString('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export default function PeriodsPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [month, setMonth] = useState('7');
  const [day, setDay] = useState('1');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingCalendar, setSavingCalendar] = useState(false);
  const [repairingPeriodId, setRepairingPeriodId] = useState<string | null>(null);
  const [workingPeriodId, setWorkingPeriodId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const businessId = getBusinessId();

    if (!businessId) return;

    setError('');

    try {
      const dashboard = await api<Dashboard>(`/periods/businesses/${businessId}/dashboard`);
      setData(dashboard);
      setMonth(String(dashboard.business.fiscalYearStartMonth || 7));
      setDay(String(dashboard.business.fiscalYearStartDay || 1));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load periods');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function saveCalendar(e: FormEvent) {
    e.preventDefault();

    if (savingCalendar) return;

    const businessId = getBusinessId();

    if (!businessId) return;

    setMessage('');
    setError('');
    setSavingCalendar(true);

    try {
      await api(`/periods/businesses/${businessId}/fiscal-calendar`, {
        method: 'PATCH',
        body: JSON.stringify({
          fiscalYearStartMonth: Number(month),
          fiscalYearStartDay: Number(day),
          reason: reason || 'Fiscal calendar updated.',
        }),
      });

      setReason('');
      setMessage('Fiscal calendar updated.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update fiscal calendar');
    } finally {
      setSavingCalendar(false);
    }
  }

  async function repairOpeningBalances(period: Period) {
    if (repairingPeriodId) return;

    const businessId = getBusinessId();

    if (!businessId) return;

    setMessage('');
    setError('');
    setRepairingPeriodId(period.id);

    try {
      await api(`/periods/businesses/${businessId}/periods/${period.id}/repair-opening-balances`, {
        method: 'POST',
      });

      setMessage(`Opening balances repaired for ${period.label}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not repair opening balances');
    } finally {
      setRepairingPeriodId(null);
    }
  }

  async function reopenPeriod(period: Period) {
    if (workingPeriodId) return;

    const businessId = getBusinessId();

    if (!businessId) return;

    const reopenReason = window.prompt(
      `Reason required to reopen ${period.label}. This action is allowed only for Ahmad Arif.`,
    );

    if (!reopenReason?.trim()) return;

    setMessage('');
    setError('');
    setWorkingPeriodId(period.id);

    try {
      await api(`/periods/businesses/${businessId}/periods/${period.id}/reopen`, {
        method: 'POST',
        body: JSON.stringify({
          reason: reopenReason.trim(),
        }),
      });

      setMessage(`${period.label} reopened.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reopen period');
    } finally {
      setWorkingPeriodId(null);
    }
  }

  async function finalClosePeriod(period: Period) {
    if (workingPeriodId) return;

    const businessId = getBusinessId();

    if (!businessId) return;

    const ok = window.confirm(
      `Final-close ${period.label}? Only Ahmad Arif can reopen/final-close periods.`,
    );

    if (!ok) return;

    setMessage('');
    setError('');
    setWorkingPeriodId(period.id);

    try {
      await api(`/periods/businesses/${businessId}/periods/${period.id}/final-close`, {
        method: 'POST',
        body: JSON.stringify({
          reason: 'Final close from Periods page.',
        }),
      });

      setMessage(`${period.label} final-closed.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not final-close period');
    } finally {
      setWorkingPeriodId(null);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <ClientRequired title="Select a client to manage periods">
          <div className="mx-auto max-w-7xl px-4 py-8">
            <Card>
              <p className="text-sm text-slate-600">Loading accounting periods...</p>
            </Card>
          </div>
        </ClientRequired>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <ClientRequired title="Select a client to manage fiscal periods">
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
          <div className="rounded-3xl bg-slate-950 p-6 text-white shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
              Fiscal periods and carry-forward
            </p>
            <h1 className="mt-2 text-3xl font-bold">Accounting Periods</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">
              Each client has its own fiscal calendar. When a new period starts, previous open
              periods are automatically closed and opening balances are repaired for the new period.
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
                <Metric label="Current period" value={data.currentPeriod.label} />
                <Metric label="Period status" value={data.currentPeriod.status.replaceAll('_', ' ')} />
                <Metric
                  label="Opening balance difference"
                  value={money(data.openingSummary.difference)}
                />
              </div>

              <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
                <div className="space-y-6">
                  <Card>
                    <h2 className="text-xl font-bold text-slate-900">Fiscal calendar</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Set the fiscal year start separately for this client.
                    </p>

                    <form onSubmit={saveCalendar} className="mt-5 space-y-3">
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Fiscal year start month
                        </label>
                        <Select value={month} onChange={(e) => setMonth(e.target.value)}>
                          {months.map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </Select>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Fiscal year start day
                        </label>
                        <Input
                          type="number"
                          min="1"
                          max="31"
                          value={day}
                          onChange={(e) => setDay(e.target.value)}
                        />
                      </div>

                      <Input
                        placeholder="Reason optional"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />

                      <Button
                        type="submit"
                        disabled={savingCalendar}
                        className="w-full disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {savingCalendar ? 'Saving...' : 'Save Fiscal Calendar'}
                      </Button>
                    </form>
                  </Card>

                  <Card>
                    <h2 className="text-xl font-bold text-slate-900">Current opening balances</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      These balances are calculated from prior-period permanent accounts and profit
                      closed into equity/capital.
                    </p>

                    <div className="mt-4 grid gap-3">
                      <Metric label="Rows" value={String(data.openingSummary.count)} />
                      <Metric label="Opening debit" value={money(data.openingSummary.totalDebit)} />
                      <Metric label="Opening credit" value={money(data.openingSummary.totalCredit)} />
                    </div>
                  </Card>
                </div>

                <Card>
                  <h2 className="text-xl font-bold text-slate-900">Accounting periods</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Previous periods are auto-closed when a new current period is created. Reopening
                    is Ahmad-only.
                  </p>

                  <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Period</th>
                          <th className="px-4 py-3">Dates</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-100">
                        {data.periods.map((period) => (
                          <tr key={period.id} className="bg-white">
                            <td className="px-4 py-3">
                              <p className="font-semibold text-slate-900">{period.label}</p>
                              <p className="text-xs text-slate-500">
                                Opening rows: {period.openingBalancesCount || 0}
                              </p>
                            </td>

                            <td className="px-4 py-3 text-slate-600">
                              {period.startDateDisplay} to {period.endDateDisplay}
                            </td>

                            <td className="px-4 py-3">
                              <StatusBadge status={period.status} />
                              {period.reopenReason && (
                                <p className="mt-1 text-xs text-amber-700">
                                  Reason: {period.reopenReason}
                                </p>
                              )}
                            </td>

                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => repairOpeningBalances(period)}
                                  disabled={repairingPeriodId === period.id}
                                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {repairingPeriodId === period.id ? 'Repairing...' : 'Repair OB'}
                                </button>

                                {data.permissions.canReopenPreviousPeriod &&
                                  period.status !== 'OPEN' &&
                                  period.status !== 'REOPENED' && (
                                    <button
                                      type="button"
                                      onClick={() => reopenPeriod(period)}
                                      disabled={workingPeriodId === period.id}
                                      className="rounded-xl border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      Reopen
                                    </button>
                                  )}

                                {data.permissions.canFinalClosePeriod &&
                                  period.status !== 'FINAL_CLOSED' && (
                                    <button
                                      type="button"
                                      onClick={() => finalClosePeriod(period)}
                                      disabled={workingPeriodId === period.id}
                                      className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      Final close
                                    </button>
                                  )}
                              </div>
                            </td>
                          </tr>
                        ))}

                        {!data.periods.length && (
                          <tr>
                            <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
                              No periods found yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
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
    <Card>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
    </Card>
  );
}

function StatusBadge({ status }: { status: Period['status'] }) {
  const className =
    status === 'OPEN'
      ? 'bg-emerald-100 text-emerald-800'
      : status === 'REOPENED'
        ? 'bg-amber-100 text-amber-800'
        : status === 'FINAL_CLOSED'
          ? 'bg-slate-900 text-white'
          : 'bg-slate-100 text-slate-700';

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-bold ${className}`}>
      {status.replaceAll('_', ' ')}
    </span>
  );
}
