'use client';

import Link from 'next/link';

import {
  useCallback,
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
} from '@/lib/api';

type ExportHistoryRow = {
  exportNo: string;

  referenceNo: string;

  displayNumber: string;

  reportType: string;

  format: string;

  dateFrom?:
    | string
    | null;

  dateTo?:
    | string
    | null;

  filename: string;

  createdAt: string;
};

type ExportHistoryResponse = {
  isFirmUser: boolean;

  clientName: string;

  exports:
    ExportHistoryRow[];
};

function reportLabel(
  value: string,
) {
  return String(
    value ||
      'report',
  )
    .replace(
      /[_-]+/g,
      ' ',
    )
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase(),
    );
}

function formatDate(
  value?:
    | string
    | null,

  includeTime = false,
) {
  if (!value) {
    return '-';
  }

  const date =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return '-';
  }

  const options:
    Intl.DateTimeFormatOptions =
    {
      timeZone:
        'Asia/Karachi',

      day: '2-digit',

      month: 'short',

      year: 'numeric',
    };

  if (
    includeTime
  ) {
    options.hour =
      '2-digit';

    options.minute =
      '2-digit';
  }

  return new Intl.DateTimeFormat(
    'en-PK',
    options,
  ).format(
    date,
  );
}

function formatBadge(
  format: string,
) {
  const value =
    String(
      format ||
        'file',
    ).toUpperCase();

  return value ===
    'EXCEL'
    ? 'XLSX'
    : value;
}

export default function ExportHistoryPage() {
  const [
    result,
    setResult,
  ] =
    useState<
      ExportHistoryResponse | null
    >(null);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

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
          setResult(
            null,
          );

          setLoading(
            false,
          );

          return;
        }

        setLoading(
          true,
        );

        setError('');

        try {
          const response =
            await api<ExportHistoryResponse>(
              `/accounting/businesses/${businessId}/reporting/report-exports`,
            );

          setResult(
            response,
          );
        } catch (
          loadError
        ) {
          setResult(
            null,
          );

          setError(
            loadError instanceof
              Error
              ? loadError.message
              : 'Could not load export history.',
          );
        } finally {
          setLoading(
            false,
          );
        }
      },
      [],
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

  const exports =
    result?.exports ||
    [];

  const xlsxCount =
    useMemo(
      () =>
        exports.filter(
          (record) =>
            [
              'xlsx',
              'excel',
            ].includes(
              String(
                record.format ||
                  '',
              ).toLowerCase(),
            ),
        ).length,
      [exports],
    );

  const csvCount =
    useMemo(
      () =>
        exports.filter(
          (record) =>
            String(
              record.format ||
                '',
            ).toLowerCase() ===
            'csv',
        ).length,
      [exports],
    );

  return (
    <AppShell>
      <ClientRequired>
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
          <section className="flex flex-col justify-between gap-4 rounded-3xl bg-slate-950 p-6 text-white shadow-sm md:flex-row md:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
                Completed reports
              </p>

              <h1 className="mt-2 text-3xl font-bold">
                Export History
              </h1>

              <p className="mt-2 max-w-3xl text-sm text-slate-300">
                Every completed
                report export has
                a permanent EX
                reference. The
                same EX reference
                is used in the
                generated filename
                and XLSX export
                metadata.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/reports"
                className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/15"
              >
                Report Builder
              </Link>

              <Link
                href="/report-requests"
                className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/15"
              >
                Report Requests
              </Link>
            </div>
          </section>

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              label="Total exports"
              value={String(
                exports.length,
              )}
              detail="Permanent EX records"
            />

            <Metric
              label="XLSX"
              value={String(
                xlsxCount,
              )}
              detail="Excel workbook exports"
            />

            <Metric
              label="CSV"
              value={String(
                csvCount,
              )}
              detail="CSV exports"
            />

            <Metric
              label="Latest"
              value={
                exports[0]
                  ?.exportNo ||
                '-'
              }
              detail="Most recent export reference"
              mono
            />
          </section>

          <Card>
            <div className="flex flex-col justify-between gap-3 border-b border-slate-100 pb-4 md:flex-row md:items-end">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  {result?.clientName ||
                    'Selected client'}
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  {result?.isFirmUser
                    ? 'Firm view: all exports for this client.'
                    : 'Client view: exports generated by your user account.'}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  void load()
                }
                disabled={
                  loading
                }
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading
                  ? 'Refreshing…'
                  : 'Refresh'}
              </button>
            </div>

            {loading ? (
              <div className="py-12 text-center text-sm text-slate-500">
                Loading export
                history…
              </div>
            ) : exports.length ? (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-[1000px] w-full border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="border-b border-slate-200 px-3 py-3">
                        Export
                        Reference
                      </th>

                      <th className="border-b border-slate-200 px-3 py-3">
                        Report
                      </th>

                      <th className="border-b border-slate-200 px-3 py-3">
                        Format
                      </th>

                      <th className="border-b border-slate-200 px-3 py-3">
                        Period
                      </th>

                      <th className="border-b border-slate-200 px-3 py-3">
                        Filename
                      </th>

                      <th className="border-b border-slate-200 px-3 py-3">
                        Generated
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {exports.map(
                      (record) => (
                        <tr
                          key={
                            record.exportNo
                          }
                          className="align-top hover:bg-slate-50"
                        >
                          <td className="border-b border-slate-100 px-3 py-4">
                            <span className="inline-flex rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-mono text-xs font-bold text-emerald-700">
                              {
                                record.exportNo
                              }
                            </span>
                          </td>

                          <td className="border-b border-slate-100 px-3 py-4 font-semibold text-slate-900">
                            {reportLabel(
                              record.reportType,
                            )}
                          </td>

                          <td className="border-b border-slate-100 px-3 py-4">
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                              {formatBadge(
                                record.format,
                              )}
                            </span>
                          </td>

                          <td className="whitespace-nowrap border-b border-slate-100 px-3 py-4 text-slate-600">
                            {formatDate(
                              record.dateFrom,
                            )}{' '}
                            to{' '}
                            {formatDate(
                              record.dateTo,
                            )}
                          </td>

                          <td className="max-w-sm break-all border-b border-slate-100 px-3 py-4 font-mono text-xs text-slate-600">
                            {
                              record.filename
                            }
                          </td>

                          <td className="whitespace-nowrap border-b border-slate-100 px-3 py-4 text-slate-600">
                            {formatDate(
                              record.createdAt,
                              true,
                            )}
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
                  No completed
                  exports yet
                </h3>

                <p className="mt-2 text-sm text-slate-500">
                  Generate an XLSX
                  or CSV report and
                  its permanent EX
                  reference will
                  appear here.
                </p>
              </div>
            )}
          </Card>

          <p className="text-xs text-slate-400">
            Export History
            currently records
            completed export
            metadata.
            Re-download behavior
            remains part of the
            later frozen export
            history implementation.
          </p>
        </div>
      </ClientRequired>
    </AppShell>
  );
}

function Metric({
  label,
  value,
  detail,
  mono = false,
}: {
  label: string;

  value: string;

  detail: string;

  mono?: boolean;
}) {
  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>

      <p
        className={`mt-2 break-words text-xl font-bold text-slate-900 ${
          mono
            ? 'font-mono'
            : ''
        }`}
      >
        {value}
      </p>

      <p className="mt-1 text-xs text-slate-500">
        {detail}
      </p>
    </Card>
  );
}
