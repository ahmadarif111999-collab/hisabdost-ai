'use client';

import Link from 'next/link';
import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppShell } from '@/components/AppShell';
import { ClientRequired } from '@/components/ClientRequired';
import { Card } from '@/components/Card';
import {
  api,
  getBusinessId,
  money,
} from '@/lib/api';

type Dashboard = {
  cash: number;
  bank: number;
  wallet: number;
  receivables: number;
  payables: number;
};

type PaymentRow = {
  id: string;
  paymentNo: string;
  displayNumber: string;
  direction: string;
  directionLabel: string;
  partyType?: string | null;
  partyName: string;
  amount: number;
  paymentMethod: string;
  paymentMethodLabel: string;
  paymentDate: string;
  paymentDateDisplay: string;
  externalReference?: string | null;
  notes?: string | null;
  accountCode?: string | null;
  accountName: string;
};

type PaymentActivity = {
  timezone: string;

  filters: {
    from?: string | null;
    to?: string | null;
    direction: string;
    paymentMethod: string;
    limit: number;
  };

  summary: {
    totalReceived: number;
    totalPaid: number;
    netMovement: number;
    receivedCount: number;
    paidCount: number;
    returnedCount: number;
  };

  rows: PaymentRow[];
};

export default function CashBankPage() {
  const [
    data,
    setData,
  ] = useState<Dashboard | null>(
    null,
  );

  const [
    activity,
    setActivity,
  ] = useState<PaymentActivity | null>(
    null,
  );

  const [
    from,
    setFrom,
  ] = useState('');

  const [
    to,
    setTo,
  ] = useState('');

  const [
    direction,
    setDirection,
  ] = useState('all');

  const [
    paymentMethod,
    setPaymentMethod,
  ] = useState('all');

  const [
    search,
    setSearch,
  ] = useState('');

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState('');

  async function load() {
    const businessId =
      getBusinessId();

    if (!businessId) {
      setData(null);
      setActivity(null);
      setLoading(false);

      setError(
        'Select a client company before viewing cash and bank activity.',
      );

      return;
    }

    setLoading(true);
    setError('');

    const params =
      new URLSearchParams();

    if (from) {
      params.set(
        'from',
        from,
      );
    }

    if (to) {
      params.set(
        'to',
        to,
      );
    }

    if (
      direction !== 'all'
    ) {
      params.set(
        'direction',
        direction,
      );
    }

    if (
      paymentMethod !== 'all'
    ) {
      params.set(
        'paymentMethod',
        paymentMethod,
      );
    }

    params.set(
      'limit',
      '200',
    );

    try {
      const [
        dashboardResult,
        activityResult,
      ] = await Promise.all([
        api<Dashboard>(
          `/accounting/businesses/${businessId}/dashboard`,
        ),

        api<PaymentActivity>(
          `/references/businesses/${businessId}/payments?${params.toString()}`,
        ),
      ]);

      setData(
        dashboardResult,
      );

      setActivity(
        activityResult,
      );
    } catch (loadError) {
      setData(null);
      setActivity(null);

      setError(
        loadError instanceof
          Error
          ? loadError.message
          : 'Could not load cash and bank activity.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();

    window.addEventListener(
      'pakbooks-business-changed',
      load,
    );

    return () => {
      window.removeEventListener(
        'pakbooks-business-changed',
        load,
      );
    };
  }, [
    from,
    to,
    direction,
    paymentMethod,
  ]);

  const filteredRows =
    useMemo(() => {
      const query =
        search
          .trim()
          .toLowerCase();

      if (!query) {
        return (
          activity?.rows || []
        );
      }

      return (
        activity?.rows || []
      ).filter((row) =>
        [
          row.paymentNo,
          row.partyName,
          row.paymentMethodLabel,
          row.accountCode,
          row.accountName,
          row.externalReference,
          row.notes,
        ]
          .filter(Boolean)
          .some((value) =>
            String(value)
              .toLowerCase()
              .includes(query),
          ),
      );
    }, [activity, search]);

  function clearFilters() {
    setFrom('');
    setTo('');
    setDirection('all');
    setPaymentMethod('all');
    setSearch('');
  }

  return (
    <AppShell>
      <ClientRequired>
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
          <div className="flex flex-col justify-between gap-4 rounded-3xl bg-slate-950 p-6 text-white shadow-sm md:flex-row md:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
                Cash controls
              </p>

              <h1 className="mt-2 text-3xl font-bold">
                Cash & Bank
              </h1>

              <p className="mt-2 max-w-3xl text-sm text-slate-300">
                Review balances and
                payment activity using
                permanent references
                such as
                PAY-2026-000001.
                External bank or
                cheque references
                remain visible
                separately.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                void load()
              }
              disabled={loading}
              className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading
                ? 'Refreshing...'
                : 'Refresh balances'}
            </button>
          </div>

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {data && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <Metric
                label="Cash in Hand"
                value={money(
                  data.cash,
                )}
                code="1000"
              />

              <Metric
                label="Bank Account"
                value={money(
                  data.bank,
                )}
                code="1010"
              />

              <Metric
                label="Wallet"
                value={money(
                  data.wallet,
                )}
                code="1020"
              />

              <Metric
                label="Receivables"
                value={money(
                  data.receivables,
                )}
                code="1100"
              />

              <Metric
                label="Payables"
                value={money(
                  Math.abs(
                    data.payables,
                  ),
                )}
                code="2000"
              />
            </div>
          )}

          {activity && (
            <div className="grid gap-4 md:grid-cols-3">
              <SummaryCard
                label="Money received"
                value={money(
                  activity.summary
                    .totalReceived,
                )}
                detail={`${
                  activity.summary
                    .receivedCount
                } receipt${
                  activity.summary
                    .receivedCount ===
                  1
                    ? ''
                    : 's'
                } in the selected period`}
              />

              <SummaryCard
                label="Money paid"
                value={money(
                  activity.summary
                    .totalPaid,
                )}
                detail={`${
                  activity.summary
                    .paidCount
                } payment${
                  activity.summary
                    .paidCount === 1
                    ? ''
                    : 's'
                } in the selected period`}
              />

              <SummaryCard
                label="Net movement"
                value={money(
                  activity.summary
                    .netMovement,
                )}
                detail="Receipts less outgoing payments"
                highlight
              />
            </div>
          )}

          <Card>
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Payment activity
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Generated payment
                  numbers are
                  permanent and never
                  expose database IDs.
                </p>
              </div>

              <button
                type="button"
                onClick={
                  clearFilters
                }
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Clear filters
              </button>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <label className="text-sm font-semibold text-slate-700">
                From

                <input
                  type="date"
                  value={from}
                  onChange={(
                    event,
                  ) =>
                    setFrom(
                      event.target
                        .value,
                    )
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-normal outline-none focus:border-emerald-500"
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                To

                <input
                  type="date"
                  value={to}
                  onChange={(
                    event,
                  ) =>
                    setTo(
                      event.target
                        .value,
                    )
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-normal outline-none focus:border-emerald-500"
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                Direction

                <select
                  value={direction}
                  onChange={(
                    event,
                  ) =>
                    setDirection(
                      event.target
                        .value,
                    )
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-normal outline-none focus:border-emerald-500"
                >
                  <option value="all">
                    All directions
                  </option>

                  <option value="received">
                    Money received
                  </option>

                  <option value="paid">
                    Money paid
                  </option>
                </select>
              </label>

              <label className="text-sm font-semibold text-slate-700">
                Method

                <select
                  value={
                    paymentMethod
                  }
                  onChange={(
                    event,
                  ) =>
                    setPaymentMethod(
                      event.target
                        .value,
                    )
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-normal outline-none focus:border-emerald-500"
                >
                  <option value="all">
                    All methods
                  </option>

                  <option value="cash">
                    Cash
                  </option>

                  <option value="bank">
                    Bank
                  </option>

                  <option value="wallet">
                    Wallet
                  </option>
                </select>
              </label>

              <label className="text-sm font-semibold text-slate-700">
                Search

                <input
                  type="search"
                  value={search}
                  onChange={(
                    event,
                  ) =>
                    setSearch(
                      event.target
                        .value,
                    )
                  }
                  placeholder="PAY number, party, note..."
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-normal outline-none focus:border-emerald-500"
                />
              </label>
            </div>
          </Card>

          <Card>
            <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Payment register
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  {
                    filteredRows.length
                  }{' '}
                  payment
                  {filteredRows.length ===
                  1
                    ? ''
                    : 's'}{' '}
                  shown
                </p>
              </div>

              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Pakistan time
              </p>
            </div>

            <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">
                      Payment no.
                    </th>

                    <th className="px-4 py-3">
                      Date
                    </th>

                    <th className="px-4 py-3">
                      Direction
                    </th>

                    <th className="px-4 py-3">
                      Party
                    </th>

                    <th className="px-4 py-3">
                      Account
                    </th>

                    <th className="px-4 py-3">
                      Method
                    </th>

                    <th className="px-4 py-3">
                      External ref.
                    </th>

                    <th className="px-4 py-3 text-right">
                      Amount
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 bg-white">
                  {loading ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-4 py-10 text-center text-slate-500"
                      >
                        Loading payment
                        activity...
                      </td>
                    </tr>
                  ) : filteredRows.length ? (
                    filteredRows.map(
                      (row) => (
                        <tr
                          key={row.id}
                          className="align-top hover:bg-slate-50/70"
                        >
                          <td className="px-4 py-3">
                            <p className="font-mono text-sm font-bold text-slate-900">
                              {
                                row.paymentNo
                              }
                            </p>

                            {row.notes && (
                              <p className="mt-1 max-w-xs text-xs text-slate-500">
                                {
                                  row.notes
                                }
                              </p>
                            )}
                          </td>

                          <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                            {
                              row.paymentDateDisplay
                            }
                          </td>

                          <td className="px-4 py-3">
                            <DirectionBadge
                              direction={
                                row.direction
                              }
                            />
                          </td>

                          <td className="px-4 py-3 font-semibold text-slate-800">
                            {
                              row.partyName
                            }
                          </td>

                          <td className="px-4 py-3 text-slate-600">
                            <p className="font-semibold text-slate-800">
                              {
                                row.accountName
                              }
                            </p>

                            <p className="mt-1 text-xs text-slate-400">
                              {row.accountCode ||
                                '-'}
                            </p>
                          </td>

                          <td className="px-4 py-3 text-slate-600">
                            {
                              row.paymentMethodLabel
                            }
                          </td>

                          <td className="px-4 py-3 font-mono text-xs text-slate-600">
                            {row.externalReference ||
                              '-'}
                          </td>

                          <td
                            className={`whitespace-nowrap px-4 py-3 text-right font-bold ${
                              row.direction ===
                              'received'
                                ? 'text-emerald-700'
                                : 'text-red-700'
                            }`}
                          >
                            {row.direction ===
                            'received'
                              ? '+'
                              : '-'}

                            {money(
                              row.amount,
                            )}
                          </td>
                        </tr>
                      ),
                    )
                  ) : (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-4 py-10 text-center"
                      >
                        <p className="font-semibold text-slate-800">
                          No payment
                          activity found
                        </p>

                        <p className="mt-1 text-sm text-slate-500">
                          Change the
                          filters or
                          record a
                          customer or
                          supplier
                          payment.
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </ClientRequired>
    </AppShell>
  );
}

function Metric({
  label,
  value,
  code,
}: {
  label: string;
  value: string;
  code: string;
}) {
  return (
    <Card className="h-full">
      <p className="text-sm text-slate-500">
        {label}
      </p>

      <p className="mt-2 text-2xl font-bold text-slate-900">
        {value}
      </p>

      <Link
        href={`/ledgers?account=${code}`}
        className="mt-3 inline-block text-sm font-semibold text-emerald-700 hover:text-emerald-800"
      >
        Open ledger →
      </Link>
    </Card>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  highlight = false,
}: {
  label: string;
  value: string;
  detail: string;
  highlight?: boolean;
}) {
  return (
    <Card
      className={
        highlight
          ? 'border-emerald-200 bg-emerald-50'
          : ''
      }
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>

      <p className="mt-2 text-2xl font-bold text-slate-900">
        {value}
      </p>

      <p className="mt-1 text-sm text-slate-500">
        {detail}
      </p>
    </Card>
  );
}

function DirectionBadge({
  direction,
}: {
  direction: string;
}) {
  const received =
    direction === 'received';

  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
        received
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-red-200 bg-red-50 text-red-700'
      }`}
    >
      {received
        ? 'Received'
        : 'Paid'}
    </span>
  );
}
