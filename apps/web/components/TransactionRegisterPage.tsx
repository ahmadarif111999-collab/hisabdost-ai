'use client';

import Link from 'next/link';

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { AppShell } from '@/components/AppShell';

import { ClientRequired } from '@/components/ClientRequired';

import {
  Card,
  Input,
} from '@/components/Card';

import {
  api,
  downloadBase64File,
  getBusinessId,
} from '@/lib/api';

type RegisterKind =
  | 'expense'
  | 'purchase';

type RegisterRow = {
  reference: string;

  journalReference: string;

  date: string;

  vendor: string;

  account: string;

  description: string;

  paymentMethod: string;

  amount: number;

  tax: number;

  documentStatus: string;

  receiptAttached: boolean;

  documentReference: string;

  createdBy: string;

  approvedBy: string;

  status: string;
};

type RegisterResponse = {
  kind: RegisterKind;

  title: string;

  clientName: string;

  generatedAt: string;

  timezone: string;

  filters: {
    startDate?:
      | string
      | null;

    endDate?:
      | string
      | null;

    vendor?: string;

    paymentMethod?: string;

    documentStatus?: string;

    reference?: string;

    search?: string;
  };

  options: {
    vendors: string[];

    paymentMethods: string[];
  };

  rows: RegisterRow[];

  totals: {
    count: number;

    amount: number;

    tax: number;

    missingDocuments: number;

    attachedDocuments: number;

    manualResolutions: number;
  };
};

type ExportResponse = {
  exportNo?: string;

  referenceNo?: string;

  filename: string;

  mimeType: string;

  contentBase64: string;

  message?: string;
};

type Filters = {
  startDate: string;

  endDate: string;

  vendor: string;

  paymentMethod: string;

  documentStatus: string;

  reference: string;

  search: string;
};

function defaultStartDate() {
  const today =
    new Date();

  const year =
    today.getMonth() + 1 >= 7
      ? today.getFullYear()
      : today.getFullYear() -
        1;

  return `${year}-07-01`;
}

function defaultEndDate() {
  return new Date()
    .toISOString()
    .slice(0, 10);
}

function money(
  value: number,
) {
  return `Rs. ${Number(
    value || 0,
  ).toLocaleString(
    'en-PK',
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    },
  )}`;
}

function queryString(
  filters: Filters,
) {
  const params =
    new URLSearchParams();

  Object.entries(
    filters,
  ).forEach(
    ([key, value]) => {
      if (
        value &&
        !(
          key ===
            'documentStatus' &&
          value === 'all'
        )
      ) {
        params.set(
          key,
          value,
        );
      }
    },
  );

  const query =
    params.toString();

  return query
    ? `?${query}`
    : '';
}

function referenceBadge(
  value: string,
  expectedPrefix: string,
) {
  const valid =
    value?.startsWith(
      `${expectedPrefix}-`,
    );

  return valid
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-slate-200 bg-slate-50 text-slate-600';
}

export function TransactionRegisterPage({
  kind,
}: {
  kind: RegisterKind;
}) {
  const isExpense =
    kind === 'expense';

  const plural =
    isExpense
      ? 'expenses'
      : 'purchases';

  const prefix =
    isExpense
      ? 'EXP'
      : 'PUR';

  const title =
    isExpense
      ? 'Expense Register'
      : 'Purchase Register';

  const initialFilters =
    useMemo<Filters>(
      () => ({
        startDate:
          defaultStartDate(),

        endDate:
          defaultEndDate(),

        vendor: '',

        paymentMethod: '',

        documentStatus:
          'all',

        reference: '',

        search: '',
      }),
      [],
    );

  const [
    filters,
    setFilters,
  ] =
    useState<Filters>(
      initialFilters,
    );

  const [
    appliedFilters,
    setAppliedFilters,
  ] =
    useState<Filters>(
      initialFilters,
    );

  const [
    result,
    setResult,
  ] =
    useState<
      RegisterResponse | null
    >(null);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    exporting,
    setExporting,
  ] =
    useState(false);

  const [
    message,
    setMessage,
  ] =
    useState('');

  const [
    error,
    setError,
  ] =
    useState('');

  const load =
    useCallback(
      async () => {
        const businessId =
          getBusinessId();

        if (!businessId) {
          setResult(null);

          setLoading(
            false,
          );

          return;
        }

        setLoading(true);

        setError('');

        try {
          const response =
            await api<RegisterResponse>(
              `/accounting/businesses/${businessId}/registers/${plural}${queryString(
                appliedFilters,
              )}`,
            );

          setResult(
            response,
          );
        } catch (loadError) {
          setResult(null);

          setError(
            loadError instanceof
              Error
              ? loadError.message
              : `Could not load the ${title.toLowerCase()}.`,
          );
        } finally {
          setLoading(
            false,
          );
        }
      },
      [
        appliedFilters,
        plural,
        title,
      ],
    );

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
  }, [load]);

  function applyFilters(
    event: FormEvent,
  ) {
    event.preventDefault();

    setMessage('');

    setAppliedFilters(
      filters,
    );
  }

  async function exportXlsx() {
    if (exporting) {
      return;
    }

    const businessId =
      getBusinessId();

    if (!businessId) {
      return;
    }

    setExporting(true);

    setMessage('');

    setError('');

    try {
      const response =
        await api<ExportResponse>(
          `/accounting/businesses/${businessId}/registers/${plural}/export`,
          {
            method: 'POST',

            body:
              JSON.stringify(
                appliedFilters,
              ),
          },
        );

      downloadBase64File(
        response.filename,
        response.mimeType,
        response.contentBase64,
      );

      setMessage(
        response.message ||
          `${response.exportNo || response.referenceNo || 'Filtered register'} exported.`,
      );
    } catch (exportError) {
      setError(
        exportError instanceof
          Error
          ? exportError.message
          : 'Could not export the filtered XLSX register.',
      );
    } finally {
      setExporting(
        false,
      );
    }
  }

  const rows =
    result?.rows || [];

  const totals =
    result?.totals;

  const filterCount =
    useMemo(
      () =>
        [
          filters.vendor,

          filters.paymentMethod,

          filters.documentStatus !==
          'all'
            ? filters.documentStatus
            : '',

          filters.reference,

          filters.search,
        ].filter(Boolean)
          .length,
      [filters],
    );

  return (
    <AppShell>
      <ClientRequired>
        <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-8">
          <section className="flex flex-col justify-between gap-4 rounded-3xl bg-slate-950 p-6 text-white shadow-sm lg:flex-row lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
                Client transaction
                history
              </p>

              <h1 className="mt-2 text-3xl font-bold">
                {title}
              </h1>

              <p className="mt-2 max-w-3xl text-sm text-slate-300">
                Review permanent{' '}
                {prefix}{' '}
                references, linked JE
                entries, vendor,
                payment method,
                document status,
                attached receipt
                references, and period
                totals without exposing
                internal database IDs.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href={
                  isExpense
                    ? '/purchases'
                    : '/expenses'
                }
                className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/15"
              >
                Open{' '}
                {isExpense
                  ? 'Purchases'
                  : 'Expenses'}
              </Link>

              <Link
                href="/transactions"
                className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/15"
              >
                New transaction
              </Link>
            </div>
          </section>

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
              onSubmit={
                applyFilters
              }
              className="space-y-4"
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Start date
                  </label>

                  <Input
                    type="date"
                    value={
                      filters.startDate
                    }
                    onChange={(
                      event,
                    ) =>
                      setFilters(
                        (
                          current,
                        ) => ({
                          ...current,

                          startDate:
                            event
                              .target
                              .value,
                        }),
                      )
                    }
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    End date
                  </label>

                  <Input
                    type="date"
                    value={
                      filters.endDate
                    }
                    onChange={(
                      event,
                    ) =>
                      setFilters(
                        (
                          current,
                        ) => ({
                          ...current,

                          endDate:
                            event
                              .target
                              .value,
                        }),
                      )
                    }
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Supplier /
                    vendor
                  </label>

                  <select
                    value={
                      filters.vendor
                    }
                    onChange={(
                      event,
                    ) =>
                      setFilters(
                        (
                          current,
                        ) => ({
                          ...current,

                          vendor:
                            event
                              .target
                              .value,
                        }),
                      )
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-500"
                  >
                    <option value="">
                      All vendors
                    </option>

                    {(
                      result
                        ?.options
                        .vendors ||
                      []
                    ).map(
                      (vendor) => (
                        <option
                          key={
                            vendor
                          }
                          value={
                            vendor
                          }
                        >
                          {vendor}
                        </option>
                      ),
                    )}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Payment method
                  </label>

                  <select
                    value={
                      filters.paymentMethod
                    }
                    onChange={(
                      event,
                    ) =>
                      setFilters(
                        (
                          current,
                        ) => ({
                          ...current,

                          paymentMethod:
                            event
                              .target
                              .value,
                        }),
                      )
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-500"
                  >
                    <option value="">
                      All methods
                    </option>

                    {(
                      result
                        ?.options
                        .paymentMethods ||
                      []
                    ).map(
                      (method) => (
                        <option
                          key={
                            method
                          }
                          value={
                            method
                          }
                        >
                          {method}
                        </option>
                      ),
                    )}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Document status
                  </label>

                  <select
                    value={
                      filters.documentStatus
                    }
                    onChange={(
                      event,
                    ) =>
                      setFilters(
                        (
                          current,
                        ) => ({
                          ...current,

                          documentStatus:
                            event
                              .target
                              .value,
                        }),
                      )
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-500"
                  >
                    <option value="all">
                      All documents
                    </option>

                    <option value="attached">
                      Receipt attached
                    </option>

                    <option value="missing">
                      Missing document
                    </option>

                    <option value="manual">
                      Resolved manually
                    </option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Reference search
                  </label>

                  <Input
                    value={
                      filters.reference
                    }
                    onChange={(
                      event,
                    ) =>
                      setFilters(
                        (
                          current,
                        ) => ({
                          ...current,

                          reference:
                            event
                              .target
                              .value,
                        }),
                      )
                    }
                    placeholder={`${prefix}-2026-000001 / JE / DOC`}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Description /
                    vendor search
                  </label>

                  <Input
                    value={
                      filters.search
                    }
                    onChange={(
                      event,
                    ) =>
                      setFilters(
                        (
                          current,
                        ) => ({
                          ...current,

                          search:
                            event
                              .target
                              .value,
                        }),
                      )
                    }
                    placeholder="Search vendor, account, description, creator, status…"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={
                    loading
                  }
                  className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading
                    ? 'Loading…'
                    : `Apply filters${filterCount ? ` (${filterCount})` : ''}`}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const resetFilters =
                      {
                        ...initialFilters,
                      };

                    setFilters(
                      resetFilters,
                    );

                    setAppliedFilters(
                      resetFilters,
                    );
                  }}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  Reset
                </button>

                <button
                  type="button"
                  onClick={
                    exportXlsx
                  }
                  disabled={
                    exporting ||
                    loading
                  }
                  className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {exporting
                    ? 'Preparing XLSX…'
                    : 'Export filtered XLSX'}
                </button>
              </div>
            </form>
          </Card>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            <Metric
              label="Rows"
              value={String(
                totals?.count ||
                  0,
              )}
              detail="Filtered transactions"
            />

            <Metric
              label="Amount"
              value={money(
                totals?.amount ||
                  0,
              )}
              detail="Filtered period amount"
            />

            <Metric
              label="Tax"
              value={money(
                totals?.tax || 0,
              )}
              detail="Filtered tax total"
            />

            <Metric
              label="Attached"
              value={String(
                totals?.attachedDocuments ||
                  0,
              )}
              detail="Receipt/document available"
            />

            <Metric
              label="Manual"
              value={String(
                totals?.manualResolutions ||
                  0,
              )}
              detail="Resolved with audited note"
            />

            <Metric
              label="Missing"
              value={String(
                totals?.missingDocuments ||
                  0,
              )}
              detail="Needs document follow-up"
            />
          </section>

          <Card>
            <div className="flex flex-col justify-between gap-2 border-b border-slate-100 pb-4 md:flex-row md:items-end">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  {result?.title ||
                    title}
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  {result?.clientName ||
                    'Selected client'}{' '}
                  · {rows.length}{' '}
                  row
                  {rows.length === 1
                    ? ''
                    : 's'}{' '}
                  · Pakistan
                  timezone
                </p>
              </div>

              <p className="text-xs text-slate-400">
                No Prisma/CUID
                values are
                displayed.
              </p>
            </div>

            {loading ? (
              <div className="py-12 text-center text-sm text-slate-500">
                Loading{' '}
                {title.toLowerCase()}
                …
              </div>
            ) : rows.length ? (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-[1500px] w-full border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {[
                        'Reference',
                        'Journal',
                        'Date',
                        'Supplier / Vendor',
                        'Description',
                        'Payment',
                        'Amount',
                        'Tax',
                        'Document',
                        'Created By',
                        'Approved By',
                        'Status',
                      ].map(
                        (
                          column,
                        ) => (
                          <th
                            key={
                              column
                            }
                            className="border-b border-slate-200 px-3 py-3"
                          >
                            {column}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>

                  <tbody>
                    {rows.map(
                      (
                        row,
                        index,
                      ) => (
                        <tr
                          key={`${row.reference}-${row.journalReference}-${index}`}
                          className="align-top hover:bg-slate-50"
                        >
                          <td className="border-b border-slate-100 px-3 py-4">
                            <span
                              className={`inline-flex rounded-lg border px-2.5 py-1 font-mono text-xs font-bold ${referenceBadge(
                                row.reference,
                                prefix,
                              )}`}
                            >
                              {
                                row.reference
                              }
                            </span>
                          </td>

                          <td className="border-b border-slate-100 px-3 py-4">
                            <Link
                              href={`/journals?reference=${encodeURIComponent(
                                row.journalReference,
                              )}`}
                              className="font-mono text-xs font-semibold text-blue-700 hover:underline"
                            >
                              {
                                row.journalReference
                              }
                            </Link>
                          </td>

                          <td className="whitespace-nowrap border-b border-slate-100 px-3 py-4 text-slate-600">
                            {row.date ||
                              '-'}
                          </td>

                          <td className="border-b border-slate-100 px-3 py-4">
                            <p className="font-semibold text-slate-800">
                              {
                                row.vendor
                              }
                            </p>

                            <p className="mt-1 text-xs text-slate-400">
                              {
                                row.account
                              }
                            </p>
                          </td>

                          <td className="max-w-sm border-b border-slate-100 px-3 py-4 text-slate-600">
                            {
                              row.description
                            }
                          </td>

                          <td className="border-b border-slate-100 px-3 py-4 text-slate-600">
                            {
                              row.paymentMethod
                            }
                          </td>

                          <td className="whitespace-nowrap border-b border-slate-100 px-3 py-4 font-semibold text-slate-900">
                            {money(
                              row.amount,
                            )}
                          </td>

                          <td className="whitespace-nowrap border-b border-slate-100 px-3 py-4 text-slate-600">
                            {money(
                              row.tax,
                            )}
                          </td>

                          <td className="border-b border-slate-100 px-3 py-4">
                            {row.documentStatus ===
                              'Resolved manually' &&
                            row.documentReference.startsWith(
                              'DOC-',
                            ) ? (
                              <div className="space-y-1">
                                <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
                                  Resolved
                                  manually
                                </span>

                                <div>
                                  <Link
                                    href={`/documents?reference=${encodeURIComponent(
                                      row.documentReference,
                                    )}`}
                                    className="font-mono text-xs font-semibold text-blue-700 hover:underline"
                                  >
                                    {
                                      row.documentReference
                                    }{' '}
                                    · Open
                                    record
                                  </Link>
                                </div>
                              </div>
                            ) : row.receiptAttached &&
                              row.documentReference.startsWith(
                                'DOC-',
                              ) ? (
                              <div className="space-y-1">
                                <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                                  Attached
                                </span>

                                <div>
                                  <Link
                                    href={`/documents?reference=${encodeURIComponent(
                                      row.documentReference,
                                    )}`}
                                    className="font-mono text-xs font-semibold text-blue-700 hover:underline"
                                  >
                                    {
                                      row.documentReference
                                    }{' '}
                                    · Open
                                    vault
                                  </Link>
                                </div>
                              </div>
                            ) : (
                              <Link
                                href="/documents?missing=true"
                                className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                              >
                                Missing ·
                                Resolve
                              </Link>
                            )}
                          </td>

                          <td className="border-b border-slate-100 px-3 py-4 text-slate-600">
                            {
                              row.createdBy
                            }
                          </td>

                          <td className="border-b border-slate-100 px-3 py-4 text-slate-600">
                            {
                              row.approvedBy
                            }
                          </td>

                          <td className="border-b border-slate-100 px-3 py-4">
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                              {
                                row.status
                              }
                            </span>
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center">
                <h3 className="text-lg font-bold text-slate-900">
                  No {plural}{' '}
                  match these
                  filters
                </h3>

                <p className="mt-2 text-sm text-slate-500">
                  Adjust the
                  period, vendor,
                  payment method,
                  reference, or
                  document status
                  and try again.
                </p>
              </div>
            )}
          </Card>
        </div>
      </ClientRequired>
    </AppShell>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;

  value: string;

  detail: string;
}) {
  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>

      <p className="mt-2 text-xl font-bold text-slate-900">
        {value}
      </p>

      <p className="mt-1 text-xs text-slate-500">
        {detail}
      </p>
    </Card>
  );
}
