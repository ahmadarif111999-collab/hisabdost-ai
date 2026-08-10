'use client';

import Link from 'next/link';

import {
  FormEvent,
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

type Account = {
  id: string;

  code: string;

  name: string;

  type: string;
};

type PreviewColumn =
  | string
  | {
      key: string;

      label?: string;

      align?:
        | 'left'
        | 'right'
        | 'center';
    };

type PreviewSection = {
  title: string;

  columns: PreviewColumn[];

  rows: Record<
    string,
    any
  >[];

  totals?: Record<
    string,
    any
  >;

  note?: string;
};

type ReportPreview = {
  reportType: string;

  title: string;

  subtitle: string;

  clientName: string;

  generatedAt: string;

  timezone: string;

  filters: Record<
    string,
    any
  >;

  sections:
    PreviewSection[];
};

type ExportResponse = {
  exportNo?: string;

  referenceNo?: string;

  filename: string;

  mimeType: string;

  contentBase64: string;

  message?: string;
};

type RequestResponse = {
  message?: string;

  requestNo?: string;

  referenceNo?: string;

  request?: {
    requestNo?: string;

    referenceNo?: string;
  };
};

const reportTypes = [
  [
    'profit-loss',
    'Profit & Loss',
  ],

  [
    'balance-sheet',
    'Balance Sheet',
  ],

  [
    'trial-balance',
    'Trial Balance',
  ],

  [
    'general-ledger',
    'General Ledger',
  ],

  [
    'sales',
    'Sales Report',
  ],

  [
    'purchases',
    'Purchase Report',
  ],

  [
    'expenses',
    'Expense Report',
  ],

  [
    'cash-bank',
    'Cash & Bank Report',
  ],

  [
    'tax-summary',
    'Tax Summary',
  ],

  [
    'missing-documents',
    'Missing Documents',
  ],
];

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
  value: any,
) {
  const amount =
    Number(value || 0);

  if (
    Number.isNaN(
      amount,
    )
  ) {
    return String(
      value || '-',
    );
  }

  if (amount < 0) {
    return `(${Math.abs(
      amount,
    ).toLocaleString(
      'en-PK',
      {
        minimumFractionDigits: 0,

        maximumFractionDigits: 2,
      },
    )})`;
  }

  return amount.toLocaleString(
    'en-PK',
    {
      minimumFractionDigits: 0,

      maximumFractionDigits: 2,
    },
  );
}

function formatCell(
  value: any,
) {
  if (
    typeof value ===
    'number'
  ) {
    return money(value);
  }

  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return '-';
  }

  if (
    typeof value ===
    'object'
  ) {
    return JSON.stringify(
      value,
    );
  }

  return String(value);
}

function normalizeColumn(
  column: PreviewColumn,
) {
  if (
    typeof column ===
    'string'
  ) {
    return {
      key: column,

      label: column
        .replace(
          /([A-Z])/g,
          ' $1',
        )
        .replace(
          /[_-]+/g,
          ' ',
        )
        .replace(
          /\s+/g,
          ' ',
        )
        .trim()
        .replace(
          /^./,
          (char) =>
            char.toUpperCase(),
        ),
    };
  }

  return {
    key: column.key,

    label:
      column.label ||
      column.key,

    align:
      column.align,
  };
}

function referenceLike(
  value: any,
) {
  return /^(JE|INV|EXP|PUR|PAY|REC|RPT|EX|DOC)-\d{4}-\d{6}$/i.test(
    String(
      value || '',
    ),
  );
}

export default function ReportsPage() {
  const [
    accounts,
    setAccounts,
  ] =
    useState<Account[]>(
      [],
    );

  const [
    preview,
    setPreview,
  ] =
    useState<
      ReportPreview | null
    >(null);

  const [
    reportType,
    setReportType,
  ] =
    useState(
      'profit-loss',
    );

  const [
    startDate,
    setStartDate,
  ] =
    useState(
      defaultStartDate(),
    );

  const [
    endDate,
    setEndDate,
  ] =
    useState(
      defaultEndDate(),
    );

  const [
    accountId,
    setAccountId,
  ] =
    useState('');

  const [
    includeZeroBalances,
    setIncludeZeroBalances,
  ] =
    useState(false);

  const [
    missingDocumentsOnly,
    setMissingDocumentsOnly,
  ] =
    useState(false);

  const [
    search,
    setSearch,
  ] =
    useState('');

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    previewing,
    setPreviewing,
  ] =
    useState(false);

  const [
    exporting,
    setExporting,
  ] =
    useState(false);

  const [
    requesting,
    setRequesting,
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

  const filters = {
    reportType,

    startDate,

    endDate,

    accountId:
      reportType ===
      'general-ledger'
        ? accountId
        : '',

    accountCode: '',

    accountCodes: [],

    includeZeroBalances,

    showMovementColumns:
      true,

    missingDocumentsOnly,

    format: 'xlsx',
  };

  async function loadAccounts() {
    const businessId =
      getBusinessId();

    if (!businessId) {
      setAccounts([]);

      setLoading(false);

      return;
    }

    try {
      const result =
        await api<
          Account[]
        >(
          `/accounting/businesses/${businessId}/accounts`,
        );

      setAccounts(
        result,
      );

      setAccountId(
        (current) =>
          current &&
          result.some(
            (account) =>
              account.id ===
              current,
          )
            ? current
            : result[0]
                ?.id || '',
      );
    } catch (loadError) {
      setError(
        loadError instanceof
          Error
          ? loadError.message
          : 'Could not load accounts',
      );
    } finally {
      setLoading(
        false,
      );
    }
  }

  useEffect(() => {
    void loadAccounts();

    const onBusinessChanged =
      () => {
        setPreview(null);

        setSearch('');

        setLoading(true);

        void loadAccounts();
      };

    window.addEventListener(
      'pakbooks-business-changed',
      onBusinessChanged,
    );

    return () => {
      window.removeEventListener(
        'pakbooks-business-changed',
        onBusinessChanged,
      );
    };
  }, []);

  async function previewReport(
    event?: FormEvent,
  ) {
    event?.preventDefault();

    if (previewing) {
      return;
    }

    const businessId =
      getBusinessId();

    if (!businessId) {
      return;
    }

    if (
      reportType ===
        'general-ledger' &&
      !accountId
    ) {
      setError(
        'Select an account for the General Ledger.',
      );

      return;
    }

    setMessage('');

    setError('');

    setPreviewing(
      true,
    );

    try {
      const result =
        await api<ReportPreview>(
          `/accounting/businesses/${businessId}/reporting/preview`,
          {
            method: 'POST',

            body:
              JSON.stringify(
                filters,
              ),
          },
        );

      setPreview(
        result,
      );

      setMessage(
        'Report preview generated with permanent user-facing references.',
      );
    } catch (previewError) {
      setError(
        previewError instanceof
          Error
          ? previewError.message
          : 'Could not preview report',
      );
    } finally {
      setPreviewing(
        false,
      );
    }
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

    if (
      reportType ===
        'general-ledger' &&
      !accountId
    ) {
      setError(
        'Select an account for the General Ledger.',
      );

      return;
    }

    setMessage('');

    setError('');

    setExporting(
      true,
    );

    try {
      const result =
        await api<ExportResponse>(
          `/accounting/businesses/${businessId}/xlsx/reports`,
          {
            method: 'POST',

            body:
              JSON.stringify(
                filters,
              ),
          },
        );

      downloadBase64File(
        result.filename,
        result.mimeType,
        result.contentBase64,
      );

      setMessage(
        result.message ||
          `${result.exportNo || result.referenceNo || 'XLSX report'} exported.`,
      );
    } catch (exportError) {
      setError(
        exportError instanceof
          Error
          ? exportError.message
          : 'Could not export XLSX report',
      );
    } finally {
      setExporting(
        false,
      );
    }
  }

  async function requestExport() {
    if (requesting) {
      return;
    }

    const businessId =
      getBusinessId();

    if (!businessId) {
      return;
    }

    if (
      reportType ===
        'general-ledger' &&
      !accountId
    ) {
      setError(
        'Select an account for the General Ledger.',
      );

      return;
    }

    setMessage('');

    setError('');

    setRequesting(
      true,
    );

    try {
      const result =
        await api<RequestResponse>(
          `/accounting/businesses/${businessId}/reporting/request-export`,
          {
            method: 'POST',

            body:
              JSON.stringify(
                {
                  ...filters,

                  reason:
                    'Client requested XLSX report from Report Builder.',
                },
              ),
          },
        );

      const requestNo =
        result.requestNo ||
        result.referenceNo ||
        result.request
          ?.requestNo ||
        result.request
          ?.referenceNo;

      setMessage(
        result.message ||
          `${requestNo || 'Report export request'} sent to the firm for approval.`,
      );
    } catch (requestError) {
      setError(
        requestError instanceof
          Error
          ? requestError.message
          : 'Could not request export approval',
      );
    } finally {
      setRequesting(
        false,
      );
    }
  }

  const filteredPreview =
    useMemo(() => {
      if (!preview) {
        return null;
      }

      const query =
        search
          .trim()
          .toLowerCase();

      if (!query) {
        return preview;
      }

      return {
        ...preview,

        sections:
          preview.sections.map(
            (section) => ({
              ...section,

              rows:
                section.rows.filter(
                  (row) =>
                    Object.values(
                      row,
                    ).some(
                      (
                        value,
                      ) =>
                        String(
                          typeof value ===
                            'object' &&
                            value !==
                              null
                            ? JSON.stringify(
                                value,
                              )
                            : value ??
                                '',
                        )
                          .toLowerCase()
                          .includes(
                            query,
                          ),
                    ),
                ),
            }),
          ),
      };
    }, [
      preview,
      search,
    ]);

  return (
    <AppShell>
      <ClientRequired>
        <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-8">
          <section className="flex flex-col justify-between gap-4 rounded-3xl bg-slate-950 p-6 text-white shadow-sm lg:flex-row lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
                Report builder
              </p>

              <h1 className="mt-2 text-3xl font-bold">
                Reports & XLSX
                Export
              </h1>

              <p className="mt-2 max-w-3xl text-sm text-slate-300">
                Preview reports
                with JE, INV,
                EXP, PUR, REC,
                PAY and DOC
                references, export
                EX-numbered XLSX
                files, or submit an
                RPT-numbered
                approval request.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/expenses"
                className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/15"
              >
                Expense Register
              </Link>

              <Link
                href="/purchases"
                className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/15"
              >
                Purchase Register
              </Link>

              <Link
                href="/report-requests"
                className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/15"
              >
                Report Requests
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
                previewReport
              }
              className="space-y-4"
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Report type
                  </label>

                  <select
                    value={
                      reportType
                    }
                    onChange={(
                      event,
                    ) => {
                      setReportType(
                        event
                          .target
                          .value,
                      );

                      setPreview(
                        null,
                      );

                      setSearch('');
                    }}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-500"
                  >
                    {reportTypes.map(
                      ([
                        value,
                        label,
                      ]) => (
                        <option
                          key={
                            value
                          }
                          value={
                            value
                          }
                        >
                          {label}
                        </option>
                      ),
                    )}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Start date
                  </label>

                  <Input
                    type="date"
                    value={
                      startDate
                    }
                    onChange={(
                      event,
                    ) =>
                      setStartDate(
                        event
                          .target
                          .value,
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
                      endDate
                    }
                    onChange={(
                      event,
                    ) =>
                      setEndDate(
                        event
                          .target
                          .value,
                      )
                    }
                  />
                </div>

                {reportType ===
                'general-ledger' ? (
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Ledger account
                    </label>

                    <select
                      value={
                        accountId
                      }
                      onChange={(
                        event,
                      ) =>
                        setAccountId(
                          event
                            .target
                            .value,
                        )
                      }
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-500"
                    >
                      <option value="">
                        Select
                        account
                      </option>

                      {accounts.map(
                        (
                          account,
                        ) => (
                          <option
                            key={
                              account.id
                            }
                            value={
                              account.id
                            }
                          >
                            {
                              account.code
                            }{' '}
                            —{' '}
                            {
                              account.name
                            }
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                    {loading
                      ? 'Loading accounts…'
                      : 'Account selection is only required for General Ledger.'}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={
                      includeZeroBalances
                    }
                    onChange={(
                      event,
                    ) =>
                      setIncludeZeroBalances(
                        event
                          .target
                          .checked,
                      )
                    }
                  />

                  Include zero
                  balances
                </label>

                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={
                      missingDocumentsOnly
                    }
                    onChange={(
                      event,
                    ) =>
                      setMissingDocumentsOnly(
                        event
                          .target
                          .checked,
                      )
                    }
                  />

                  Missing documents
                  only
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={
                    previewing
                  }
                  className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {previewing
                    ? 'Previewing…'
                    : 'Preview'}
                </button>

                <button
                  type="button"
                  onClick={
                    exportXlsx
                  }
                  disabled={
                    exporting
                  }
                  className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {exporting
                    ? 'Exporting…'
                    : 'Export XLSX'}
                </button>

                <button
                  type="button"
                  onClick={
                    requestExport
                  }
                  disabled={
                    requesting
                  }
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {requesting
                    ? 'Requesting…'
                    : 'Request Export Approval'}
                </button>
              </div>
            </form>
          </Card>

          {filteredPreview ? (
            <ReportPreviewCard
              preview={
                filteredPreview
              }
              search={
                search
              }
              setSearch={
                setSearch
              }
            />
          ) : (
            <Card>
              <div className="py-12 text-center">
                <h3 className="text-lg font-bold text-slate-900">
                  No preview yet
                </h3>

                <p className="mt-2 text-sm text-slate-500">
                  Choose your
                  filters and
                  generate a report
                  preview.
                </p>
              </div>
            </Card>
          )}
        </div>
      </ClientRequired>
    </AppShell>
  );
}

function ReportPreviewCard({
  preview,
  search,
  setSearch,
}: {
  preview: ReportPreview;

  search: string;

  setSearch:
    (value: string) =>
      void;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              {preview.title}
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              {preview.subtitle}
            </p>

            <p className="mt-2 text-xs text-slate-400">
              Client:{' '}
              {
                preview.clientName
              }{' '}
              • Generated:{' '}
              {
                preview.generatedAt
              }{' '}
              •{' '}
              {
                preview.timezone
              }
            </p>
          </div>

          <div className="w-full md:max-w-md">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Search preview
            </label>

            <Input
              value={search}
              onChange={(
                event,
              ) =>
                setSearch(
                  event.target
                    .value,
                )
              }
              placeholder="Search EXP, PUR, JE, REC, PAY, DOC, vendor…"
            />
          </div>
        </div>
      </Card>

      {preview.sections.map(
        (
          section,
          index,
        ) => (
          <SectionTable
            key={`${section.title}-${index}`}
            section={
              section
            }
          />
        ),
      )}
    </div>
  );
}

function SectionTable({
  section,
}: {
  section:
    PreviewSection;
}) {
  const columns = (
    section.columns || []
  ).map(
    normalizeColumn,
  );

  return (
    <Card>
      <h3 className="text-lg font-bold text-slate-900">
        {section.title}
      </h3>

      {section.note && (
        <p className="mt-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {section.note}
        </p>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              {columns.map(
                (column) => (
                  <th
                    key={
                      column.key
                    }
                    className={`whitespace-nowrap border-b border-slate-200 px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 ${
                      column.align ===
                      'right'
                        ? 'text-right'
                        : 'text-left'
                    }`}
                  >
                    {
                      column.label
                    }
                  </th>
                ),
              )}
            </tr>
          </thead>

          <tbody>
            {section.rows.map(
              (
                row,
                index,
              ) => (
                <tr
                  key={
                    index
                  }
                  className="hover:bg-slate-50"
                >
                  {columns.map(
                    (
                      column,
                    ) => {
                      const value =
                        row[
                          column
                            .key
                        ];

                      return (
                        <td
                          key={
                            column.key
                          }
                          className={`whitespace-nowrap border-b border-slate-100 px-3 py-3 ${
                            column.align ===
                            'right'
                              ? 'text-right'
                              : 'text-left'
                          }`}
                        >
                          {referenceLike(
                            value,
                          ) ? (
                            <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 font-mono text-xs font-semibold text-emerald-700">
                              {String(
                                value,
                              )}
                            </span>
                          ) : (
                            formatCell(
                              value,
                            )
                          )}
                        </td>
                      );
                    },
                  )}
                </tr>
              ),
            )}

            {!section.rows
              .length && (
              <tr>
                <td
                  colSpan={Math.max(
                    columns.length,
                    1,
                  )}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No rows for this
                  section.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {section.totals && (
        <div className="mt-4 flex flex-wrap gap-3 rounded-2xl bg-slate-50 p-4">
          {Object.entries(
            section.totals,
          ).map(
            ([
              key,
              value,
            ]) => (
              <div
                key={key}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {key
                    .replace(
                      /([A-Z])/g,
                      ' $1',
                    )
                    .replace(
                      /^./,
                      (
                        char,
                      ) =>
                        char.toUpperCase(),
                    )}
                </p>

                <p className="mt-1 font-bold text-slate-900">
                  {formatCell(
                    value,
                  )}
                </p>
              </div>
            ),
          )}
        </div>
      )}
    </Card>
  );
}
